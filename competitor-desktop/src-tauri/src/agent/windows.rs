use std::sync::Arc;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use super::state::AgentState;

pub const SETUP_WINDOW: &str = "setup";

pub fn open_setup(app: &AppHandle) {
    show_page(app, "index.html");
}

fn show_page(app: &AppHandle, page: &'static str) {
    if app
        .state::<Arc<AgentState>>()
        .stopping
        .load(std::sync::atomic::Ordering::Relaxed)
    {
        return;
    }
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);

    if let Some(window) = app.get_webview_window(SETUP_WINDOW) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.eval(format!(
            "if (!location.pathname.endsWith('/{page}')) location.replace('{page}');"
        ));
        return;
    }

    let app = app.clone();
    let dispatch = app.clone();
    if let Err(err) = dispatch.run_on_main_thread(move || {
        if let Some(window) = app.get_webview_window(SETUP_WINDOW) {
            let _ = window.show();
            let _ = window.set_focus();
            return;
        }
        let built = WebviewWindowBuilder::new(&app, SETUP_WINDOW, WebviewUrl::App(page.into()))
            .title("Algothon Proctor")
            .inner_size(520.0, 580.0)
            .min_inner_size(440.0, 460.0)
            .resizable(true)
            .center()
            .build();

        if let Err(err) = built {
            log::error!("could not open the setup window: {err}");
            super::lifecycle::request_exit(
                &app,
                &app.state::<Arc<AgentState>>(),
                "application window failed",
            );
        }
    }) {
        log::error!("could not schedule the setup window: {err}");
    }
}

pub fn close_setup(app: &AppHandle) {
    open_diagnostics(app);
}

pub fn open_diagnostics(app: &AppHandle) {
    let state = app.state::<Arc<AgentState>>();
    show_page(
        app,
        if state.is_enrolled() {
            "diagnostics.html"
        } else {
            "index.html"
        },
    );
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
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = std::process::Command::new("cmd")
            .args(["/c", "start", "", url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }

    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(url).spawn();

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let _ = std::process::Command::new("xdg-open").arg(url).spawn();
}
