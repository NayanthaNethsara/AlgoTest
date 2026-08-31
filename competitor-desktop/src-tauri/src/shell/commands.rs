use std::sync::atomic::Ordering;
use std::sync::Arc;

use tauri::{AppHandle, State};

use super::{monitors, portal_entry_url, probe, ShellTarget, QUITTING};
use crate::agent::state::AgentState;

#[tauri::command]
pub fn get_shell_target(state: State<'_, Arc<AgentState>>) -> ShellTarget {
    ShellTarget {
        server_url: state.server_url(),
        api_url: state.api_url(),
        message: state
            .last_error
            .lock()
            .ok()
            .and_then(|m| m.clone())
            .unwrap_or_default(),
    }
}

#[tauri::command]
pub fn exit_competition(app: AppHandle, state: State<'_, Arc<AgentState>>) -> Result<(), String> {
    QUITTING.store(true, Ordering::Relaxed);
    super::disable_kiosk();
    monitors::clear_monitor_lockouts(&app);
    crate::agent::lifecycle::stop_and_exit(
        &app,
        state.inner(),
        "contestant exited competition from desktop UI",
    );
    Ok(())
}

#[tauri::command]
pub fn retry_connection(
    window: tauri::WebviewWindow,
    state: State<'_, Arc<AgentState>>,
) -> Result<(), String> {
    let server_url = state.server_url();
    match probe(&server_url) {
        Ok(()) => {
            let _ = window.set_always_on_top(true);
            super::enable_kiosk(Some(&window.as_ref().window()));
            window
                .navigate(portal_entry_url(&server_url))
                .map_err(|e| e.to_string())
        }
        Err(err) => {
            state.on_error(err.clone());
            Err(err)
        }
    }
}

#[tauri::command]
pub fn open_proctor_setup(app: AppHandle) -> Result<(), String> {
    crate::agent::windows::open_setup(&app);
    Ok(())
}

