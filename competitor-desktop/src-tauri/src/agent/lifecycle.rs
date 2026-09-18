
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

use super::scheduler;
use super::state::AgentState;
use crate::SHELL_PORT;

pub fn sync_autostart(app: &AppHandle, _enrolled: bool) {
    let manager = app.autolaunch();
    let _ = manager.disable();
}

pub fn sign_out_and_quit(app: &AppHandle, state: &Arc<AgentState>, reason: &str) -> Result<(), String> {
    state.stopping.store(true, Ordering::Relaxed);
    let result = unenroll(app, state, reason);
    app.exit(0);
    result
}

pub fn unenroll(app: &AppHandle, state: &Arc<AgentState>, reason: &str) -> Result<(), String> {
    scheduler::report_shutdown(state, reason);

    crate::config::clear_enrollment()?;
    if let Ok(mut slot) = state.enrollment.lock() {
        *slot = None;
    }
    state.revoked.store(false, Ordering::Relaxed);
    state.log("signed out", reason.to_string());

    sync_autostart(app, false);
    quit_shell();
    Ok(())
}

pub fn stop_and_exit(app: &AppHandle, state: &Arc<AgentState>, reason: &str) {
    state.stopping.store(true, Ordering::Relaxed);
    scheduler::report_shutdown(state, reason);
    sync_autostart(app, false);
    quit_shell();
    app.exit(0);
}

pub fn reset_and_quit(app: &AppHandle, state: &Arc<AgentState>) {
    state.stopping.store(true, Ordering::Relaxed);
    state.stop_persisting();
    scheduler::report_shutdown(state, "all client data reset on this machine");
    quit_shell();

    let removed = crate::config::reset();
    log::info!("reset removed {} item(s): {}", removed.len(), removed.join(", "));
    app.exit(0);
}

pub fn quit_shell() {
    let _ = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(500))
        .build()
        .ok()
        .and_then(|client| client.post(crate::loopback_url(SHELL_PORT, "/quit")).send().ok());
}
