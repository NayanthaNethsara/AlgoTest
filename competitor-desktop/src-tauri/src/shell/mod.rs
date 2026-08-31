pub mod commands;
pub mod monitors;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::agent::state::AgentState;
use crate::config::ClientConfig;

pub const MAIN_WINDOW: &str = "contest";
pub const NOTCH_COVER_WINDOW: &str = "notch-cover";
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


pub fn create_contest_window(
    app: &AppHandle,
    state: &Arc<AgentState>,
) -> Result<tauri::WebviewWindow, tauri::Error> {
    #[cfg(target_os = "macos")]
    let is_native_fullscreen = false;
    #[cfg(not(target_os = "macos"))]
    let is_native_fullscreen = true;

    if let Some(existing) = app.get_webview_window(MAIN_WINDOW) {
        let _ = existing.show();
        if is_native_fullscreen {
            let _ = existing.set_fullscreen(true);
        }
        let _ = existing.set_always_on_top(true);
        let _ = existing.set_focus();
        enable_kiosk(Some(&existing.as_ref().window()));
        sync_notch_cover(app);
        monitors::sync_monitor_lockouts(app, state);
        return Ok(existing);
    }

    let monitor_count = app.available_monitors().map(|m| m.len()).unwrap_or(1);
    let server_url = state.server_url();

    let target = if monitor_count > 1 {
        monitors::MAIN_WINDOW_LOCKED_OUT.store(true, Ordering::Relaxed);
        WebviewUrl::App("multidisplay.html".into())
    } else {
        monitors::MAIN_WINDOW_LOCKED_OUT.store(false, Ordering::Relaxed);
        match probe(&server_url) {
            Ok(()) => WebviewUrl::External(portal_entry_url(&server_url)),
            Err(err) => {
                log::warn!("portal unreachable at {}: {err}", server_url);
                WebviewUrl::App("unreachable.html".into())
            }
        }
    };

    #[cfg(target_os = "macos")]
    let os_name = "macos";
    #[cfg(target_os = "windows")]
    let os_name = "windows";
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let os_name = "linux";

    let init_script = format!(
        r#"
        document.cookie = "mini-algothon-client=desktop; path=/; max-age=2592000; SameSite=Lax";
        window.__MINIALGOTHON_DESKTOP__ = true;
        window.__MINIALGOTHON_LOCKDOWN__ = true;
        window.__MINIALGOTHON_OS__ = "{os_name}";
        (function() {{
            var style = document.createElement('style');
            style.textContent = 'html, body {{ overscroll-behavior: none !important; overscroll-behavior-x: none !important; overscroll-behavior-y: none !important; -ms-scroll-chaining: none !important; user-select: auto; }} header {{ overscroll-behavior: none !important; -ms-scroll-chaining: none !important; }}';
            (document.head || document.documentElement).appendChild(style);
        }})();
        window.addEventListener('offline', function() {{
            try {{
                fetch("http://127.0.0.1:47615/offline", {{ method: "POST", mode: "no-cors" }});
            }} catch(e) {{}}
        }});
        document.addEventListener('contextmenu', function(e) {{
            e.preventDefault();
        }}, true);
        document.addEventListener('keydown', function(e) {{
            var key = e.key ? e.key.toLowerCase() : '';
            if (key === 'escape') {{
                e.preventDefault();
                e.stopPropagation();
                return false;
            }}
            if (key.startsWith('f') && key.length <= 3 && !isNaN(key.slice(1))) {{
                e.preventDefault();
                e.stopPropagation();
                return false;
            }}
            if (e.altKey && key === 'f4') {{
                e.preventDefault();
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('minialgothon:request-exit'));
                return false;
            }}
            if (e.altKey && (key === 'tab' || key === 'arrowleft' || key === 'arrowright' || key === 'home')) {{
                e.preventDefault();
                e.stopPropagation();
                return false;
            }}
            if ((e.ctrlKey || e.metaKey) && key === 'q') {{
                e.preventDefault();
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('minialgothon:request-exit'));
                return false;
            }}
            if ((e.ctrlKey || e.metaKey) && (
                key === 'r' || key === 'w' || key === 'n' || key === 't' ||
                key === 'p' || key === 's' || key === 'u' || key === 'h' || key === 'm' ||
                (e.shiftKey && (key === 'i' || key === 'j' || key === 'c' || key === 'r'))
            )) {{
                e.preventDefault();
                e.stopPropagation();
                return false;
            }}
        }}, true);
        "#
    );

    let window = WebviewWindowBuilder::new(app, MAIN_WINDOW, target)
        .title("MiniAlgothon — Contest")
        .inner_size(1280.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .fullscreen(is_native_fullscreen)
        .always_on_top(true)
        .decorations(false)
        .resizable(false)
        .minimizable(false)
        .closable(false)
        .initialization_script(&init_script)
        .build()?;

    let _ = window.set_focus();
    enable_kiosk(Some(&window.as_ref().window()));
    sync_notch_cover(app);
    monitors::sync_monitor_lockouts(app, state);
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

pub fn enable_kiosk(window: Option<&tauri::Window>) {
    #[cfg(target_os = "macos")]
    enable_macos_kiosk(window);

    #[cfg(target_os = "windows")]
    enable_windows_kiosk(window);

    #[cfg(target_os = "linux")]
    enable_linux_kiosk(window);
}

pub fn disable_kiosk() {
    #[cfg(target_os = "macos")]
    disable_macos_kiosk();

    #[cfg(target_os = "windows")]
    disable_windows_kiosk();

    #[cfg(target_os = "linux")]
    disable_linux_kiosk();
}

#[cfg(not(target_os = "macos"))]
pub fn sync_notch_cover(_app: &AppHandle) {}

#[cfg(target_os = "macos")]
pub fn sync_notch_cover(app: &AppHandle) {
    let Some(contest) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };

    let height = notch_height(&contest.as_ref().window());
    if height <= 0.0 {
        if let Some(cover) = app.get_webview_window(NOTCH_COVER_WINDOW) {
            let _ = cover.close();
        }
        return;
    }

    let Some(monitor) = contest
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| contest.primary_monitor().ok().flatten())
    else {
        return;
    };

    let scale = monitor.scale_factor();
    let x = monitor.position().x as f64 / scale;
    let y = monitor.position().y as f64 / scale;
    let width = monitor.size().width as f64 / scale;

    let cover = match app.get_webview_window(NOTCH_COVER_WINDOW) {
        Some(existing) => existing,
        None => {
            let built = WebviewWindowBuilder::new(
                app,
                NOTCH_COVER_WINDOW,
                WebviewUrl::App("notch-cover.html".into()),
            )
            .title("MiniAlgothon — Display Cover")
            .decorations(false)
            .always_on_top(true)
            .resizable(false)
            .minimizable(false)
            .closable(false)
            .focused(false)
            .skip_taskbar(true)
            .shadow(false)
            .build();

            match built {
                Ok(window) => window,
                Err(err) => {
                    log::warn!("could not build notch cover window: {err}");
                    return;
                }
            }
        }
    };

    let _ = cover.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
    let _ = cover.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }));
    let _ = cover.show();

    unsafe {
        use objc2::msg_send;
        use objc2::runtime::AnyObject;

        if let Ok(ns_window) = cover.as_ref().window().ns_window() {
            let ns_win = ns_window as *mut AnyObject;
            if !ns_win.is_null() {
                let level: isize = 1001;
                let _: () = msg_send![ns_win, setLevel: level];
                let behavior: usize = 1 | 16 | 64;
                let _: () = msg_send![ns_win, setCollectionBehavior: behavior];
            }
        }
    }
}

/// Height of the camera housing on notched displays, so contest content is not
/// hidden behind it. Zero on displays without a notch.
#[cfg(target_os = "macos")]
fn notch_height(window: &tauri::Window) -> f64 {
    use objc2::runtime::AnyObject;
    use objc2::{msg_send, sel};
    use objc2_foundation::NSEdgeInsets;

    let Ok(ns_window) = window.ns_window() else {
        return 0.0;
    };
    let ns_win = ns_window as *mut AnyObject;
    if ns_win.is_null() {
        return 0.0;
    }

    unsafe {
        let screen: *mut AnyObject = msg_send![ns_win, screen];
        if screen.is_null() {
            return 0.0;
        }
        let responds: bool = msg_send![screen, respondsToSelector: sel!(safeAreaInsets)];
        if !responds {
            return 0.0;
        }
        let insets: NSEdgeInsets = msg_send![screen, safeAreaInsets];
        insets.top
    }
}

#[cfg(target_os = "macos")]
fn enable_macos_kiosk(window: Option<&tauri::Window>) {
    unsafe {
        use objc2::class;
        use objc2::msg_send;

        let cls = class!(NSApplication);
        let app: *mut objc2::runtime::AnyObject = msg_send![cls, sharedApplication];
        if !app.is_null() {
            let options: usize = 2 | 8 | 16 | 32 | 64 | 128 | 256;
            let _: () = msg_send![app, setPresentationOptions: options];
        }

        if let Some(win) = window {
            if let Some(monitor) = win.current_monitor().ok().flatten().or_else(|| win.primary_monitor().ok().flatten()) {
                let size = monitor.size();
                let scale = monitor.scale_factor();
                let top_inset = if win.label() == MAIN_WINDOW {
                    notch_height(win)
                } else {
                    0.0
                };
                let width = size.width as f64 / scale;
                let height = size.height as f64 / scale - top_inset;
                let pos = monitor.position();
                let x = pos.x as f64 / scale;
                let y = pos.y as f64 / scale + top_inset;
                let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
                let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }));
            }

            if let Ok(ns_window) = win.ns_window() {
                let ns_win = ns_window as *mut objc2::runtime::AnyObject;
                if !ns_win.is_null() {
                    let level: isize = 1000;
                    let _: () = msg_send![ns_win, setLevel: level];
                    let behavior: usize = 1 | 16 | 64;
                    let _: () = msg_send![ns_win, setCollectionBehavior: behavior];
                    let _: () = msg_send![ns_win, makeKeyAndOrderFront: 0usize];
                }
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn disable_macos_kiosk() {
    unsafe {
        use objc2::class;
        use objc2::msg_send;

        let cls = class!(NSApplication);
        let app: *mut objc2::runtime::AnyObject = msg_send![cls, sharedApplication];
        if !app.is_null() {
            let options: usize = 0;
            let _: () = msg_send![app, setPresentationOptions: options];
        }
    }
}

#[cfg(target_os = "windows")]
fn enable_windows_kiosk(window: Option<&tauri::Window>) {
    if let Some(win) = window {
        let _ = win.set_fullscreen(true);
        let _ = win.set_always_on_top(true);
        let _ = win.set_focus();
        if let Ok(hwnd) = win.hwnd() {
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                SetWindowPos, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW,
            };
            unsafe {
                SetWindowPos(
                    hwnd.0 as _,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
                );
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn disable_windows_kiosk() {}

#[cfg(target_os = "linux")]
fn enable_linux_kiosk(window: Option<&tauri::Window>) {
    if let Some(win) = window {
        let _ = win.set_fullscreen(true);
        let _ = win.set_always_on_top(true);
        let _ = win.set_focus();
    }
}

#[cfg(target_os = "linux")]
fn disable_linux_kiosk() {}
