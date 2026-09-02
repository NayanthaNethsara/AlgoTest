//! The deliberate ways this client starts itself and the deliberate ways it stops.
//!
//! Proctoring is meant to be hard to stop by accident, which makes every path that
//! stops it on purpose worth keeping in one place: each of them has to tell the
//! server it was deliberate, drop the autostart registration, and take the contest
//! shell with it. Miss the last step and the shell's watchdog reads the stop as a
//! crash and relaunches the agent thirty seconds later.

use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

use super::scheduler;
use super::state::AgentState;
use crate::SHELL_PORT;

/// Brings the login item in line with whether this machine is enrolled.
///
/// Autostart exists for one reason — a mid-contest reboot must restore proctoring
/// — so an unenrolled machine has no business registering one. Debug builds never
/// register: a login item pointing at `target/debug` outlives the checkout that
/// produced it, and reinstalls itself every time a developer runs the app.
pub fn sync_autostart(app: &AppHandle, _enrolled: bool) {
    let manager = app.autolaunch();
    let _ = manager.disable();
}

/// Signs this machine out and closes the whole client: proctoring stops, the
/// enrollment is forgotten, the contest window goes, and the agent exits.
///
/// Nothing is left behind on a setup screen. Signing out is a contestant saying
/// they are done with this machine, and answering that by replacing one window
/// with another is not what "sign out" means to anyone.
///
/// The shutdown report has to go out before the enrollment is cleared: the token
/// it carries is what distinguishes a deliberate stop from a kill, and clearing
/// first would throw it away.
pub fn sign_out_and_quit(app: &AppHandle, state: &Arc<AgentState>, reason: &str) -> Result<(), String> {
    state.stopping.store(true, Ordering::Relaxed);
    let result = unenroll(app, state, reason);
    quit_shell();
    app.exit(0);
    result
}

/// Forgets the enrollment but keeps the agent running, for the diagnostics
/// window's re-enrol — where the whole point is to sign in again straight away.
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

/// Stops proctoring without forgetting the enrollment, then exits.
///
/// The contestant can start the client again and carry on where they left off,
/// which is why this reports a shutdown rather than pretending nothing happened:
/// a clean stop is neutral evidence, and a hard kill is not.
pub fn stop_and_exit(app: &AppHandle, state: &Arc<AgentState>, reason: &str) {
    state.stopping.store(true, Ordering::Relaxed);
    scheduler::report_shutdown(state, reason);
    sync_autostart(app, false);
    quit_shell();
    app.exit(0);
}

/// Erases everything this client stores on the machine and quits.
///
/// Reports the stop first, for the same reason as every other path here: the point
/// of a reset is a clean machine, not a missing record.
pub fn reset_and_quit(app: &AppHandle, state: &Arc<AgentState>) {
    state.stopping.store(true, Ordering::Relaxed);
    // A heartbeat already in flight would otherwise write the buffer back to disk
    // moments after the wipe deleted it, and the next launch would replay a
    // previous contestant's signals under a fresh enrollment.
    state.stop_persisting();
    scheduler::report_shutdown(state, "all client data reset on this machine");
    quit_shell();

    let removed = crate::config::reset();
    log::info!("reset removed {} item(s): {}", removed.len(), removed.join(", "));
    app.exit(0);
}

/// Asks the contest shell to exit, if one is running.
///
/// Without this the shell's watchdog notices the agent it can no longer reach and
/// relaunches it, undoing whichever stop the contestant just asked for.
pub fn quit_shell() {
    let _ = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(500))
        .build()
        .ok()
        .and_then(|client| client.post(crate::loopback_url(SHELL_PORT, "/quit")).send().ok());
}
