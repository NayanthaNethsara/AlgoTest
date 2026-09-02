use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use super::state::AgentState;
use crate::SHELL_PORT;

pub const SETUP_WINDOW: &str = "setup";
pub const DIAGNOSTICS_WINDOW: &str = "diagnostics";

pub fn open_setup(app: &AppHandle) {
    // An enrolled agent runs as a tray-only accessory, and an accessory's windows
    // open behind everything with nothing in the dock to click. Setup is the one
    // screen that exists to be interacted with, so showing it means being a normal
    // app again — otherwise signing out looks like the client simply vanished.
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);

    if let Some(window) = app.get_webview_window(SETUP_WINDOW) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let built = WebviewWindowBuilder::new(app, SETUP_WINDOW, WebviewUrl::App("index.html".into()))
        .title("MiniAlgothon — proctoring setup")
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

    // Setup is done, so the agent goes back to being a tray icon. Leaving it a
    // normal app would put a second dock entry beside the contest window for
    // something the contestant never needs to click.
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
    .title("MiniAlgothon — proctoring diagnostics")
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

    if let Ok(exe) = std::env::current_exe() {
        let file_name = exe.file_name().and_then(|s| s.to_str()).unwrap_or_default();
        if file_name.starts_with("mini-algothon-competitor") {
            if let Err(err) = std::process::Command::new(&exe).spawn() {
                log::error!("could not launch the contest shell: {err}");
            }
            return;
        }

        let sibling = exe.with_file_name(if cfg!(windows) {
            "mini-algothon-competitor.exe"
        } else {
            "mini-algothon-competitor"
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

fn raise_existing_shell() -> bool {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(400))
        .build()
        .ok()
        .and_then(|client| client.post(crate::loopback_url(SHELL_PORT, "/show")).send().ok())
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}
