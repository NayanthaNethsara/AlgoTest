use std::sync::atomic::Ordering;
use std::sync::Arc;

use tauri::AppHandle;

use super::scheduler;
use super::state::AgentState;

pub fn sign_out_and_quit(app: &AppHandle, state: &Arc<AgentState>, reason: &str) -> Result<(), String> {
    state.stopping.store(true, Ordering::Relaxed);
    crate::shell::monitors::clear_monitor_lockouts(app);
    let result = unenroll(app, state, reason);
    app.exit(0);
    result
}

pub fn unenroll(_app: &AppHandle, state: &Arc<AgentState>, reason: &str) -> Result<(), String> {
    scheduler::report_shutdown(state, reason);

    crate::config::clear_enrollment()?;
    if let Ok(mut slot) = state.enrollment.lock() {
        *slot = None;
    }
    state.revoked.store(false, Ordering::Relaxed);
    state.log("signed out", reason.to_string());
    Ok(())
}

pub fn stop_and_exit(app: &AppHandle, state: &Arc<AgentState>, reason: &str) {
    state.stopping.store(true, Ordering::Relaxed);
    crate::shell::monitors::clear_monitor_lockouts(app);
    scheduler::report_shutdown(state, reason);
    app.exit(0);
}

pub fn reset_and_quit(app: &AppHandle, state: &Arc<AgentState>) {
    state.stopping.store(true, Ordering::Relaxed);
    crate::shell::monitors::clear_monitor_lockouts(app);
    state.stop_persisting();
    scheduler::report_shutdown(state, "all client data reset on this machine");

    let removed = crate::config::reset();
    log::info!("reset removed {} item(s): {}", removed.len(), removed.join(", "));
    app.exit(0);
}
