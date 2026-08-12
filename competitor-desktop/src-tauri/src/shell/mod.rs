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
            open_proctor_setup
        ])
        .setup(move |app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;

            let window = WebviewWindowBuilder::new(app, MAIN_WINDOW, target)
                .title("MiniAlgothon")
                .inner_size(1280.0, 800.0)
                .maximized(online)
                // Fullscreen only once there is a portal to show. A fullscreen error
                // page with no window chrome is a trap.
                .fullscreen(online)
                // Never kiosk and never always-on-top: the whole point of this
                // design is that contestants alt-tab to their own IDE.
                .resizable(true)
                .build()?;

            spawn_control_listener(listener, app.handle().clone());
            spawn_agent_watchdog();

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
            let _ = window.set_fullscreen(true);
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

/// Answers the agent's two requests of this shell: come forward, or go away.
fn spawn_control_listener(listener: std::net::TcpListener, app: tauri::AppHandle) {
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };

            // Read the request line so the client sees a complete exchange rather
            // than a reset connection, and so the two routes can be told apart.
            use std::io::{Read, Write};
            let mut scratch = [0u8; 512];
            let _ = stream.set_read_timeout(Some(Duration::from_millis(200)));
            let read = stream.read(&mut scratch).unwrap_or(0);
            let path = request_path(&scratch[..read]);

            // Answer before acting on /quit: the reply never leaves the socket
            // otherwise, and the agent waits out its timeout for nothing.
            let _ = stream
                .write_all(b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            let _ = stream.flush();

            match path.as_deref() {
                // Proctoring stopped on purpose. Exiting is what stops the watchdog
                // below from reading that as a crash and relaunching the agent.
                Some("/quit") => {
                    QUITTING.store(true, Ordering::Relaxed);
                    app.exit(0);
                    return;
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
