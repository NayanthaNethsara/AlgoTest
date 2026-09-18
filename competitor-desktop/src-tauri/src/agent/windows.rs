use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use super::state::AgentState;
use crate::SHELL_PORT;

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
        .title("Algothon — proctoring setup")
        .inner_size(760.0, 820.0)
        .min_inner_size(620.0, 380.0)
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

    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
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
    .title("Algothon — proctoring diagnostics")
    .inner_size(720.0, 780.0)
    .min_inner_size(620.0, 380.0)
    .resizable(true)
    .center()
    .build();

    if let Err(err) = built {
        log::error!("could not open the diagnostics window: {err}");
    }
}

pub fn open_contest_shell(state: &Arc<AgentState>) {
    if try_raise_existing_shell() {
        return;
    }

    if state.server_url().is_empty() || !state.is_enrolled() {
        if let Some(app) = state.app_handle() {
            open_setup(&app);
        } else {
            log::warn!("client is not configured yet; cannot open the contest window");
        }
        return;
    }

    if let Ok(exe) = std::env::current_exe() {
        let file_name = exe.file_name().and_then(|s| s.to_str()).unwrap_or_default();
        if file_name.starts_with("algothon-competitor") {
            if let Err(err) = std::process::Command::new(&exe).spawn() {
                log::error!("could not launch the contest shell: {err}");
            }
            return;
        }

        let sibling = exe.with_file_name(if cfg!(windows) {
            "algothon-competitor.exe"
        } else {
            "algothon-competitor"
        });
        if sibling.is_file() {
            if let Err(err) = std::process::Command::new(&sibling).spawn() {
                log::error!("could not launch sibling contest shell: {err}");
            }
            return;
        }
    }

    open_in_browser(&state.server_url());
}

fn open_in_browser(url: &str) {
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd").args(["/c", "start", url]).spawn();

    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(url).spawn();

    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(url).spawn();
}

fn try_raise_existing_shell() -> bool {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(400))
        .build()
        .ok()
        .and_then(|client| client.post(crate::loopback_url(SHELL_PORT, "/show")).send().ok())
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}
