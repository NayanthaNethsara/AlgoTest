use std::time::Duration;
use tauri::State;

use crate::shell::watchdogs::{launch_agent, portal_entry_url, probe};
use crate::shell::ShellState;
use crate::LOOPBACK_PORTS;

#[derive(serde::Serialize)]
pub struct ShellTarget {
    pub server_url: String,
    pub api_url: String,
    pub message: String,
}

#[tauri::command]
pub fn get_shell_target(state: State<'_, ShellState>) -> ShellTarget {
    let config = state.config.lock().ok().map(|c| c.clone());
    ShellTarget {
        server_url: config.as_ref().map(|c| c.server_url.clone()).unwrap_or_default(),
        api_url: config.as_ref().map(|c| c.api_url.clone()).unwrap_or_default(),
        message: state.message.lock().map(|m| m.clone()).unwrap_or_default(),
    }
}

#[tauri::command]
pub fn minimize_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_maximize_window(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn close_window(app: tauri::AppHandle) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    use tauri::Manager;
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    use crate::shell::{MAIN_WINDOW, QUITTING};

    let app_handle = app.clone();
    app.dialog()
        .message("Are you sure you want to exit the application?")
        .title("Exit Application")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Exit".to_string(),
            "Cancel".to_string(),
        ))
        .show(move |confirmed| {
            if confirmed {
                crate::shell::window::restore_macos_presentation_options();
                QUITTING.store(true, Ordering::Relaxed);
                if let Some(window) = app_handle.get_webview_window(MAIN_WINDOW) {
                    let _ = window.set_always_on_top(false);
                    let _ = window.set_fullscreen(false);
                }
                app_handle.exit(0);
            }
        });
    Ok(())
}

#[tauri::command]
pub fn is_window_maximized(window: tauri::WebviewWindow) -> bool {
    window.is_maximized().unwrap_or(false)
}

#[tauri::command]
pub fn retry_connection(window: tauri::WebviewWindow, state: State<'_, ShellState>) -> Result<(), String> {
    let server_url = state
        .config
        .lock()
        .map_err(|_| "shell state unavailable".to_string())?
        .server_url
        .clone();

    match probe(&server_url) {
        Ok(()) => {
            let _ = window.maximize();
            window.navigate(portal_entry_url(&server_url)).map_err(|e| e.to_string())
        }
        Err(err) => {
            if let Ok(mut message) = state.message.lock() {
                *message = err.clone();
            }
            Err(err)
        }
    }
}

#[tauri::command]
pub fn open_proctor_setup() -> Result<(), String> {
    if !crate::agent::loopback::agent_already_running() {
        launch_agent();
        std::thread::sleep(Duration::from_millis(800));
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(800))
        .build()
        .map_err(|e| e.to_string())?;

    for port in LOOPBACK_PORTS {
        if let Ok(response) = client.post(crate::loopback_url(port, "/setup")).send() {
            if response.status().is_success() {
                return Ok(());
            }
        }
    }
    Err("Could not reach the proctor client on this machine.".into())
}
