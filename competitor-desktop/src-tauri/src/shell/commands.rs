use std::sync::atomic::Ordering;
use std::sync::Arc;

use tauri::{AppHandle, Manager, State};

use crate::agent::state::AgentState;
use super::{monitors, portal_entry_url, probe, LockdownStatus, ShellTarget, MAIN_WINDOW, QUITTING};

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
pub fn get_lockdown_status(app: AppHandle) -> LockdownStatus {
    let monitor_count = app.available_monitors().map(|m| m.len()).unwrap_or(1);
    let is_fullscreen = app
        .get_webview_window(MAIN_WINDOW)
        .and_then(|w| w.is_fullscreen().ok())
        .unwrap_or(true);

    LockdownStatus {
        is_locked: true,
        is_fullscreen,
        monitor_count,
    }
}

#[tauri::command]
pub fn exit_competition(app: AppHandle, state: State<'_, Arc<AgentState>>) -> Result<(), String> {
    QUITTING.store(true, Ordering::Relaxed);
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
            let _ = window.set_fullscreen(true);
            let _ = window.set_always_on_top(true);
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

#[tauri::command]
pub fn minimize_window(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == MAIN_WINDOW {
        return Ok(());
    }
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_maximize_window(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == MAIN_WINDOW {
        let _ = window.set_fullscreen(true);
        let _ = window.set_always_on_top(true);
        return Ok(());
    }
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn close_window(
    window: tauri::WebviewWindow,
    app: AppHandle,
    state: State<'_, Arc<AgentState>>,
) -> Result<(), String> {
    if window.label() == MAIN_WINDOW {
        return exit_competition(app, state);
    }
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_window_maximized(window: tauri::WebviewWindow) -> bool {
    window.is_fullscreen().unwrap_or(true) || window.is_maximized().unwrap_or(false)
}
