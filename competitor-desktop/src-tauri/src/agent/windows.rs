use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use super::state::AgentState;
use crate::SHELL_PORT;

pub const SETUP_WINDOW: &str = "setup";
pub const DIAGNOSTICS_WINDOW: &str = "diagnostics";

pub fn open_setup(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETUP_WINDOW) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let built = WebviewWindowBuilder::new(app, SETUP_WINDOW, WebviewUrl::App("index.html".into()))
        .title("MiniAlgothon — proctoring setup")
        .inner_size(760.0, 820.0)
        .resizable(true)
        .center()
        .build();

    if let Err(err) = built {
        log::error!("could not open the setup window: {err}");
    }
}

pub fn close_setup(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETUP_WINDOW) {
        let _ = window.close();
    }
}

pub fn open_diagnostics(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(DIAGNOSTICS_WINDOW) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let built = WebviewWindowBuilder::new(
        app,
        DIAGNOSTICS_WINDOW,
        WebviewUrl::App("diagnostics.html".into()),
    )
    .title("MiniAlgothon — proctoring diagnostics")
    .inner_size(720.0, 780.0)
    .resizable(true)
    .center()
    .build();

    if let Err(err) = built {
        log::error!("could not open the diagnostics window: {err}");
    }
}

/// Raises the existing contest shell if one is running, and only launches a new
/// one otherwise. Spawning a second shell over the first would discard whatever
/// the contestant had unsaved in the portal editor.
pub fn open_contest_shell(state: &Arc<AgentState>) {
    if raise_existing_shell() {
        return;
    }

    // A shell launched before enrolment would route straight back to setup, so go
    // there directly rather than flashing a process that exits.
    if state.server_url().is_empty() || !state.is_enrolled() {
        if let Some(app) = state.app_handle() {
            open_setup(&app);
        } else {
            log::warn!("client is not configured yet; cannot open the contest window");
        }
        return;
    }

    match std::env::current_exe() {
        Ok(exe) => {
            if let Err(err) = std::process::Command::new(exe).spawn() {
                log::error!("could not launch the contest shell: {err}");
            }
        }
        Err(err) => log::error!("could not locate the client executable: {err}"),
    }
}

fn raise_existing_shell() -> bool {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(400))
        .build()
        .ok()
        .and_then(|client| client.post(format!("http://127.0.0.1:{SHELL_PORT}/show")).send().ok())
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}
