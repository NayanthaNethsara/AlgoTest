use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::config::ClientConfig;
use crate::{LOOPBACK_PORTS, SHELL_PORT};

const MAIN_WINDOW: &str = "contest";
const PROBE_TIMEOUT: Duration = Duration::from_secs(4);

/// Set once the agent has told this shell to go away. The close handler below
/// otherwise refuses every close, which would turn a deliberate quit into a hang.
static QUITTING: AtomicBool = AtomicBool::new(false);

/// What the shell knows about its target, for the local fallback page.
struct ShellState {
    config: Mutex<ClientConfig>,
    message: Mutex<String>,
}

/// Runs the contest shell: a webview pointed at the server-hosted portal and
/// nothing else. It holds no credential and makes no proctoring decision, so a bug
/// in here costs a contestant a window, not their ability to submit.
pub fn run() {
    let config = crate::config::load_client();
    let configured_server_url = config.server_url.clone();

    if config.server_url.parse::<tauri::Url>().is_err() {
        log::error!("configured portal address is not a valid URL: {}", config.server_url);
        return;
    }

    let listener = match std::net::TcpListener::bind((crate::LOOPBACK_IP, SHELL_PORT)) {
        Ok(listener) => listener,
        Err(_) => {
            // Another shell already has the portal open. Ask it to come forward
            // rather than opening a second window over its unsaved work.
            request_show();
            return;
        }
    };

    // The agent is what must always be running, so the shell starts it if the
    // contestant launched the app after a reboot without it.
    if !crate::agent::loopback::agent_already_running() {
        launch_agent();
    }

    // Resolve the target *before* creating the window. A webview pointed at an
    // unreachable address renders a blank white page with no explanation, which is
    // indistinguishable from a crashed app — the worst thing to hand a contestant
    // mid-contest.
    let (target, message) = match probe(&config.server_url) {
        Ok(()) => (
            WebviewUrl::External(portal_entry_url(&config.server_url)),
            String::new(),
        ),
        Err(err) => {
            log::warn!("portal unreachable at {}: {err}", config.server_url);
            (WebviewUrl::App("unreachable.html".into()), err)
        }
    };
    let online = matches!(target, WebviewUrl::External(_));

    let state = ShellState {
        config: Mutex::new(config),
        message: Mutex::new(message),
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_shell_target,
            retry_connection,
            open_proctor_setup,
            minimize_window,
            toggle_maximize_window,
            close_window,
            is_window_maximized
        ])
        .setup(move |app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;

            #[cfg(target_os = "macos")]
            let window = WebviewWindowBuilder::new(app, MAIN_WINDOW, target)
                .title("MiniAlgothon")
                .inner_size(1280.0, 800.0)
                .min_inner_size(620.0, 380.0)
                .maximized(online)
                .resizable(true)
                .decorations(true)
                .initialization_script(r#"
                    document.cookie = "mini-algothon-client=desktop; path=/; max-age=2592000; SameSite=Lax";
                    window.__MINIALGOTHON_DESKTOP__ = true;
                    window.__MINIALGOTHON_OS__ = "macos";
                    (function() {
                        var style = document.createElement('style');
                        style.textContent = 'html, body { overscroll-behavior: none !important; overscroll-behavior-y: none !important; -ms-scroll-chaining: none !important; } header, [data-tauri-drag-region], [data-window-drag-region] { overscroll-behavior: none !important; -ms-scroll-chaining: none !important; }';
                        (document.head || document.documentElement).appendChild(style);
                    })();
                    window.addEventListener('offline', function() {
                        try {
                            fetch("http://127.0.0.1:47620/offline", { method: "POST", mode: "no-cors" });
                        } catch(e) {}
                    });
                    document.addEventListener('mousedown', function(e) {
                        if (e.buttons === 1 && e.target && e.target.closest) {
                            var dragRegion = e.target.closest('[data-tauri-drag-region], [data-window-drag-region]');
                            var interactive = e.target.closest('button, a, input, select, textarea, [data-no-drag]');
                            if (dragRegion && !interactive) {
                                try {
                                    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
                                        window.__TAURI_INTERNALS__.invoke('plugin:window|start_dragging');
                                    }
                                } catch (err) {}
                            }
                        }
                    }, true);
                "#)
                .build()?;

            #[cfg(not(target_os = "macos"))]
            let window = WebviewWindowBuilder::new(app, MAIN_WINDOW, target)
                .title("MiniAlgothon")
                .inner_size(1280.0, 800.0)
                .min_inner_size(620.0, 380.0)
                .maximized(online)
                .resizable(true)
                .decorations(false)
                .initialization_script(r#"
                    document.cookie = "mini-algothon-client=desktop; path=/; max-age=2592000; SameSite=Lax";
                    window.__MINIALGOTHON_DESKTOP__ = true;
                    window.__MINIALGOTHON_OS__ = "windows";
                    (function() {
                        var style = document.createElement('style');
                        style.textContent = 'html, body { overscroll-behavior: none !important; overscroll-behavior-y: none !important; -ms-scroll-chaining: none !important; } header, [data-tauri-drag-region], [data-window-drag-region] { overscroll-behavior: none !important; -ms-scroll-chaining: none !important; }';
                        (document.head || document.documentElement).appendChild(style);
                    })();
                    window.addEventListener('offline', function() {
                        try {
                            fetch("http://127.0.0.1:47620/offline", { method: "POST", mode: "no-cors" });
                        } catch(e) {}
                    });
                    document.addEventListener('mousedown', function(e) {
                        if (e.buttons === 1 && e.target && e.target.closest) {
                            var dragRegion = e.target.closest('[data-tauri-drag-region], [data-window-drag-region]');
                            var interactive = e.target.closest('button, a, input, select, textarea, [data-no-drag]');
                            if (dragRegion && !interactive) {
                                try {
                                    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
                                        window.__TAURI_INTERNALS__.invoke('plugin:window|start_dragging');
                                    }
                                } catch (err) {}
                            }
                        }
                    }, true);
                "#)
                .build()?;

            spawn_control_listener(listener, app.handle().clone());
            spawn_agent_watchdog();
            spawn_portal_watchdog(app.handle().clone(), configured_server_url.clone());

            let _ = window.set_focus();
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the contest window hides it. Proctoring is a separate
            // process and keeps running either way, but the portal editor's state
            // lives in this webview and is worth preserving. Once the agent has
            // asked this shell to quit there is nothing left to preserve, and
            // refusing the close then would hang the exit instead.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if !QUITTING.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(crate::context())
        .expect("failed to run the contest shell");
}

#[derive(serde::Serialize)]
struct ShellTarget {
    server_url: String,
    api_url: String,
    message: String,
}

#[tauri::command]
fn get_shell_target(state: State<'_, ShellState>) -> ShellTarget {
    let config = state.config.lock().ok().map(|c| c.clone());
    ShellTarget {
        server_url: config.as_ref().map(|c| c.server_url.clone()).unwrap_or_default(),
        api_url: config.as_ref().map(|c| c.api_url.clone()).unwrap_or_default(),
        message: state.message.lock().map(|m| m.clone()).unwrap_or_default(),
    }
}

#[tauri::command]
fn minimize_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_maximize_window(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn close_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn is_window_maximized(window: tauri::WebviewWindow) -> bool {
    window.is_maximized().unwrap_or(false)
}

/// Re-probes the portal and navigates to it if it has come back.
#[tauri::command]
fn retry_connection(window: tauri::WebviewWindow, state: State<'_, ShellState>) -> Result<(), String> {
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

/// Hands off to the agent, which owns the server address and the setup window.
#[tauri::command]
fn open_proctor_setup() -> Result<(), String> {
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

/// The portal address with the marker that tells it which client it is inside.
///
/// The portal cannot ask over IPC — the contest window loads it as a remote origin
/// and remote origins are granted no Tauri commands — so the one thing this shell
/// can hand it is the URL it opens. The portal records the marker for the tab and
/// uses it to decide whether signing out should also stop proctoring, which is the
/// right thing here and the wrong thing in a browser.
fn portal_entry_url(server_url: &str) -> tauri::Url {
    let mut url: tauri::Url = server_url.parse().expect("validated before the window is built");
    url.query_pairs_mut().append_pair("client", "desktop");
    url
}

/// One request against the portal, so failure is reported as a sentence a
/// contestant can act on rather than an empty window.
fn probe(server_url: &str) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(PROBE_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;

    match client.get(server_url).send() {
        Ok(response) if response.status().is_server_error() => {
            Err(format!("The contest server answered with {}.", response.status()))
        }
        Ok(_) => Ok(()),
        Err(err) if err.is_timeout() => Err("The contest server did not respond in time.".to_string()),
        Err(err) if err.is_connect() => {
            Err("Could not connect to the contest server. Check the network and the address.".to_string())
        }
        Err(err) => Err(format!("Could not reach the contest server: {err}")),
    }
}

/// Answers the agent's requests and window control actions.
fn spawn_control_listener(listener: std::net::TcpListener, app: tauri::AppHandle) {
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };

            use std::io::{Read, Write};
            let mut scratch = [0u8; 512];
            let _ = stream.set_read_timeout(Some(Duration::from_millis(200)));
            let read = stream.read(&mut scratch).unwrap_or(0);
            let path = request_path(&scratch[..read]);
            let is_max = app
                .get_webview_window(MAIN_WINDOW)
                .and_then(|w| w.is_maximized().ok())
                .unwrap_or(false);

            if path.as_deref() == Some("/is-maximized") {
                let body = format!("{{\"maximized\":{}}}", is_max);
                let reply = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(reply.as_bytes());
                let _ = stream.flush();
                continue;
            }

            let reply = b"HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            let _ = stream.write_all(reply);
            let _ = stream.flush();

            match path.as_deref() {
                Some("/quit") => {
                    QUITTING.store(true, Ordering::Relaxed);
                    app.exit(0);
                    return;
                }
                Some("/minimize") => {
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        let _ = window.minimize();
                    }
                }
                Some("/toggle-maximize") | Some("/maximize") => {
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        if window.is_maximized().unwrap_or(false) {
                            let _ = window.unmaximize();
                        } else {
                            let _ = window.maximize();
                        }
                    }
                }
                Some("/close") => {
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        let _ = window.hide();
                    }
                }
                Some("/drag") => {
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        let _ = window.start_dragging();
                    }
                }
                Some("/offline") | Some("/unreachable") => {
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        let _ = window.navigate(local_app_url("unreachable.html"));
                    }
                }
                _ => {
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
            }
        }
    });
}

fn request_path(bytes: &[u8]) -> Option<String> {
    let line = std::str::from_utf8(bytes).ok()?.lines().next()?;
    let target = line.split_whitespace().nth(1)?;
    Some(target.split('?').next().unwrap_or(target).to_string())
}

/// Reports shell liveness to the agent so the server can tell "the shell crashed"
/// from "the contestant chose the browser", and restarts the agent if it has gone
/// away — the one piece of self-healing that matters mid-contest.
fn spawn_agent_watchdog() {
    std::thread::spawn(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_millis(600))
            .build()
            .unwrap_or_default();
        let mut consecutive_failures = 0u32;
        let mut known_port: Option<u16> = None;
        let mut first = true;

        loop {
            if !first {
                std::thread::sleep(Duration::from_secs(10));
            }
            first = false;

            let mut reached = false;
            if let Some(port) = known_port {
                if client
                    .post(crate::loopback_url(port, "/shell"))
                    .send()
                    .map(|r| r.status().is_success())
                    .unwrap_or(false)
                {
                    reached = true;
                }
            }

            if !reached {
                for port in LOOPBACK_PORTS {
                    if client
                        .post(crate::loopback_url(port, "/shell"))
                        .send()
                        .map(|r| r.status().is_success())
                        .unwrap_or(false)
                    {
                        known_port = Some(port);
                        reached = true;
                        break;
                    }
                }
            }

            if reached {
                consecutive_failures = 0;
                continue;
            }

            known_port = None;
            consecutive_failures += 1;

            // Self-healing applies to an enrolled machine only. Once the enrollment
            // is gone the agent stopped on purpose, and relaunching it would fight
            // the contestant's own sign-out.
            if consecutive_failures == 3 && crate::config::load_enrollment().is_some() {
                log::warn!("proctor agent unreachable; relaunching it");
                launch_agent();
            }
        }
    });
}

fn launch_agent() {
    match std::env::current_exe() {
        Ok(exe) => {
            if let Err(err) = std::process::Command::new(exe).arg("--agent").spawn() {
                log::error!("could not launch the proctor agent: {err}");
            }
        }
        Err(err) => log::error!("could not locate the client executable: {err}"),
    }
}

fn request_show() {
    let _ = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(500))
        .build()
        .ok()
        .and_then(|client| client.post(crate::loopback_url(SHELL_PORT, "/show")).send().ok());
}

/// Continuously probes the portal address. If the server becomes unreachable while
/// the webview is pointing to it, navigates to the offline recovery screen before
/// the browser displays a native connection failure page.
fn spawn_portal_watchdog(app: tauri::AppHandle, server_url: String) {
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
                                log::warn!("portal server unreachable ({consecutive_failures} failed checks); showing offline screen");
                                let _ = window.navigate(local_app_url("unreachable.html"));
                            }
                        }
                    }
                }
            }
        }
    });
}

fn local_app_url(file: &str) -> tauri::Url {
    #[cfg(target_os = "windows")]
    let base = "http://tauri.localhost/";
    #[cfg(not(target_os = "windows"))]
    let base = "tauri://localhost/";
    tauri::Url::parse(&format!("{base}{file}"))
        .unwrap_or_else(|_| tauri::Url::parse("tauri://localhost/").unwrap())
}
