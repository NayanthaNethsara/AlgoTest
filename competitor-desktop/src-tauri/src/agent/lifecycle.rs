use std::sync::atomic::Ordering;
use std::sync::Arc;

use tauri::{AppHandle, Manager};

use super::scheduler;
use super::state::AgentState;

pub fn sync_autostart(_app: &AppHandle, _enrolled: bool) {
    crate::config::clear_autostart();
}

pub fn sign_out(app: &AppHandle, state: &Arc<AgentState>, reason: &str) -> Result<(), String> {
    unenroll(app, state, reason)?;
    super::windows::open_setup(app);
    Ok(())
}

pub fn unenroll(app: &AppHandle, state: &Arc<AgentState>, reason: &str) -> Result<(), String> {
    if state.signing_out.swap(true, Ordering::Relaxed) {
        return Err("Sign-out is already in progress.".into());
    }
    let _reporting = state.reporting.lock().map_err(|e| e.to_string())?;
    scheduler::report_shutdown(state, reason);

    if let Err(err) = crate::config::clear_enrollment() {
        state.revoked.store(true, Ordering::Relaxed);
        state.signing_out.store(false, Ordering::Relaxed);
        state.on_error(format!(
            "Could not clear enrollment; proctoring remains stopped: {err}"
        ));
        return Err(err);
    }
    state.buffer_clear();
    if let Ok(mut slot) = state.enrollment.lock() {
        *slot = None;
    }
    state.revoked.store(false, Ordering::Relaxed);
    if let Ok(mut ack) = state.last_ack.lock() {
        *ack = None;
    }
    if let Ok(mut ack) = state.last_ack_wall.lock() {
        *ack = None;
    }
    state.publish_nonce(String::new());
    state.set_last_signals(Default::default());
    state.rotate_boot();
    state.signing_out.store(false, Ordering::Relaxed);
    state.log("signed out", reason.to_string());

    sync_autostart(app, false);
    Ok(())
}

pub fn stop_and_exit(app: &AppHandle, state: &Arc<AgentState>, reason: &str) {
    request_exit(app, state, reason);
}

pub fn request_exit(app: &AppHandle, state: &Arc<AgentState>, reason: &str) {
    if state.stopping.swap(true, Ordering::Relaxed) {
        return;
    }
    if let Some(window) = app.get_webview_window(super::windows::SETUP_WINDOW) {
        let _ = window.set_title("Algothon Proctor — Stopping…");
    }
    let app = app.clone();
    let state = Arc::clone(state);
    let reason = reason.to_string();
    std::thread::spawn(move || {
        let _reporting = state.reporting.lock().ok();
        scheduler::report_shutdown(&state, &reason);
        state.stop_persisting();
        state.buffer_clear();
        crate::config::reset();
        if let Some(window) = app.get_webview_window(super::windows::SETUP_WINDOW) {
            if let Err(err) = window.clear_all_browsing_data() {
                log::warn!("could not clear application webview data: {err}");
            }
        }
        state.exit_ready.store(true, Ordering::Relaxed);
        app.exit(0);
    });
}

pub fn reset_and_quit(app: &AppHandle, state: &Arc<AgentState>) {
    state.stopping.store(true, Ordering::Relaxed);
    state.stop_persisting();
    let _reporting = state.reporting.lock().ok();
    scheduler::report_shutdown(state, "all client data reset on this machine");

    let removed = crate::config::reset();
    log::info!(
        "reset removed {} item(s): {}",
        removed.len(),
        removed.join(", ")
    );
    state.exit_ready.store(true, Ordering::Relaxed);
    app.exit(0);
}
