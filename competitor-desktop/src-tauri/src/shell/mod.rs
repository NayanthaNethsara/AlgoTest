pub mod commands;
pub mod monitors;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::agent::state::AgentState;
use crate::config::ClientConfig;

pub const MAIN_WINDOW: &str = "contest";
const PROBE_TIMEOUT: Duration = Duration::from_secs(4);

pub static QUITTING: AtomicBool = AtomicBool::new(false);

pub struct ShellState {
    pub config: Mutex<ClientConfig>,
    pub message: Mutex<String>,
    pub is_quitting: Arc<AtomicBool>,
}

#[derive(serde::Serialize)]
pub struct ShellTarget {
    pub server_url: String,
    pub api_url: String,
    pub message: String,
}

#[derive(serde::Serialize)]
pub struct LockdownStatus {
    pub is_locked: bool,
    pub is_fullscreen: bool,
    pub monitor_count: usize,
}

/// Creates or raises the contest window in strict kiosk lockdown mode.
pub fn create_contest_window(
    app: &AppHandle,
    state: &Arc<AgentState>,
) -> Result<tauri::WebviewWindow, tauri::Error> {
    if let Some(existing) = app.get_webview_window(MAIN_WINDOW) {
        let _ = existing.show();
        let _ = existing.set_fullscreen(true);
        let _ = existing.set_always_on_top(true);
        let _ = existing.set_focus();
        monitors::sync_monitor_lockouts(app);
        return Ok(existing);
    }

    let server_url = state.server_url();
    let (target, _) = match probe(&server_url) {
        Ok(()) => (
            WebviewUrl::External(portal_entry_url(&server_url)),
            String::new(),
        ),
        Err(err) => {
            log::warn!("portal unreachable at {}: {err}", server_url);
            (WebviewUrl::App("unreachable.html".into()), err)
        }
    };

    #[cfg(target_os = "macos")]
    let os_name = "macos";
    #[cfg(not(target_os = "macos"))]
    let os_name = "windows";

    let init_script = format!(
        r#"
        document.cookie = "mini-algothon-client=desktop; path=/; max-age=2592000; SameSite=Lax";
        window.__MINIALGOTHON_DESKTOP__ = true;
        window.__MINIALGOTHON_LOCKDOWN__ = true;
        window.__MINIALGOTHON_OS__ = "{os_name}";
        (function() {{
            var style = document.createElement('style');
            style.textContent = 'html, body {{ overscroll-behavior: none !important; overscroll-behavior-y: none !important; -ms-scroll-chaining: none !important; user-select: auto; }} header, [data-tauri-drag-region], [data-window-drag-region] {{ overscroll-behavior: none !important; -ms-scroll-chaining: none !important; }}';
            (document.head || document.documentElement).appendChild(style);
        }})();
        window.addEventListener('offline', function() {{
            try {{
                fetch("http://127.0.0.1:47615/offline", {{ method: "POST", mode: "no-cors" }});
            }} catch(e) {{}}
        }});
        document.addEventListener('keydown', function(e) {{
            if (e.key === 'F11' || (e.altKey && e.key === 'F4')) {{
                e.preventDefault();
            }}
        }}, true);
        "#
    );

    let window = WebviewWindowBuilder::new(app, MAIN_WINDOW, target)
        .title("MiniAlgothon — Contest")
        .inner_size(1280.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .fullscreen(true)
        .always_on_top(true)
        .decorations(false)
        .resizable(false)
        .initialization_script(&init_script)
        .build()?;

    let _ = window.set_focus();
    monitors::sync_monitor_lockouts(app);
    spawn_portal_watchdog(app.clone(), server_url);

    Ok(window)
}

pub fn portal_entry_url(server_url: &str) -> tauri::Url {
    let mut url: tauri::Url = server_url
        .parse()
        .unwrap_or_else(|_| tauri::Url::parse("http://127.0.0.1:3000").unwrap());
    url.query_pairs_mut().append_pair("client", "desktop");
    url
}

pub fn probe(server_url: &str) -> Result<(), String> {
    if server_url.is_empty() {
        return Err("Contest server address is not configured.".to_string());
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(PROBE_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;

    match client.get(server_url).send() {
        Ok(response) if response.status().is_server_error() => {
            Err(format!("The contest server answered with {}.", response.status()))
        }
        Ok(_) => Ok(()),
        Err(err) if err.is_timeout() => {
            Err("The contest server did not respond in time.".to_string())
        }
        Err(err) if err.is_connect() => {
            Err("Could not connect to the contest server. Check your network.".to_string())
        }
        Err(err) => Err(format!("Could not reach the contest server: {err}")),
    }
}

pub fn spawn_portal_watchdog(app: tauri::AppHandle, server_url: String) {
    if server_url.is_empty() {
        return;
    }

    std::thread::spawn(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_millis(1500))
            .build()
            .unwrap_or_default();
        let mut consecutive_failures = 0u32;

        loop {
            std::thread::sleep(Duration::from_secs(4));

            if QUITTING.load(Ordering::Relaxed) {
                break;
            }

            let reachable = client
                .get(&server_url)
                .send()
                .map(|r| !r.status().is_server_error())
                .unwrap_or(false);

            if reachable {
                consecutive_failures = 0;
            } else {
                consecutive_failures += 1;
                if consecutive_failures >= 2 {
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        if let Ok(url) = window.url() {
                            if !url.as_str().contains("unreachable.html") {
                                log::warn!(
                                    "portal server unreachable ({consecutive_failures} failed checks); showing offline screen"
                                );
                                let _ = window.navigate(local_app_url("unreachable.html"));
                            }
                        }
                    }
                }
            }
        }
    });
}

pub fn local_app_url(file: &str) -> tauri::Url {
    #[cfg(target_os = "windows")]
    let base = "http://tauri.localhost/";
    #[cfg(not(target_os = "windows"))]
    let base = "tauri://localhost/";
    tauri::Url::parse(&format!("{base}{file}"))
        .unwrap_or_else(|_| tauri::Url::parse("tauri://localhost/").unwrap())
}
