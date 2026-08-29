use std::sync::Arc;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use super::state::AgentState;

pub const SETUP_WINDOW: &str = "setup";
pub const DIAGNOSTICS_WINDOW: &str = "diagnostics";

pub fn open_setup(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);

    if let Some(window) = app.get_webview_window(SETUP_WINDOW) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let built = WebviewWindowBuilder::new(app, SETUP_WINDOW, WebviewUrl::App("index.html".into()))
        .title("MiniAlgothon — Setup")
        .inner_size(760.0, 820.0)
        .min_inner_size(620.0, 380.0)
        .resizable(true)
        .center()
        .build();

    if let Err(err) = built {
        log::error!("could not open setup window: {err}");
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
    .title("MiniAlgothon — Diagnostics")
    .inner_size(720.0, 780.0)
    .min_inner_size(620.0, 380.0)
    .resizable(true)
    .center()
    .build();

    if let Err(err) = built {
        log::error!("could not open diagnostics window: {err}");
    }
}

pub fn open_contest_shell(state: &Arc<AgentState>) {
    let Some(app) = state.app_handle() else {
        log::warn!("application handle unavailable");
        return;
    };

    if state.server_url().is_empty() || !state.is_enrolled() {
        open_setup(&app);
        return;
    }

    if let Err(err) = crate::shell::create_contest_window(&app, state) {
        log::error!("could not open contest window: {err}");
    }
}
