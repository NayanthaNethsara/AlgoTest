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
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.eval("if (window.location) window.location.reload();");
        return;
    }

    let app = app.clone();
    std::thread::spawn(move || {
        let built = WebviewWindowBuilder::new(&app, SETUP_WINDOW, WebviewUrl::App("index.html".into()))
            .title("Algothon Proctor — Setup")
            .inner_size(500.0, 560.0)
            .min_inner_size(440.0, 460.0)
            .resizable(true)
            .center()
            .build();

        if let Err(err) = built {
            log::error!("could not open the setup window: {err}");
        }
    });
}

pub fn close_setup(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETUP_WINDOW) {
        let _ = window.hide();
    }

    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
}

pub fn open_diagnostics(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(DIAGNOSTICS_WINDOW) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return;
    }

    let app = app.clone();
    std::thread::spawn(move || {
        let built = WebviewWindowBuilder::new(
            &app,
            DIAGNOSTICS_WINDOW,
            WebviewUrl::App("diagnostics.html".into()),
        )
        .title("Algothon Proctor — Diagnostics")
        .inner_size(520.0, 580.0)
        .min_inner_size(460.0, 480.0)
        .resizable(true)
        .center()
        .build();

        if let Err(err) = built {
            log::error!("could not open the diagnostics window: {err}");
        }
    });
}

pub fn open_contest_portal(state: &Arc<AgentState>) {
    if state.server_url().is_empty() || !state.is_enrolled() {
        if let Some(app) = state.app_handle() {
            open_setup(&app);
        } else {
            log::warn!("client is not configured yet; cannot open the contest window");
        }
        return;
    }

    open_in_browser(&state.server_url());
}

pub fn open_in_browser(url: &str) {
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd").args(["/c", "start", "", url]).spawn();

    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(url).spawn();

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let _ = std::process::Command::new("xdg-open").arg(url).spawn();
}
