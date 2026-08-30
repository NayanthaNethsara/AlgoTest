pub mod agent;
pub mod config;
pub mod shell;
pub mod signals;

use std::sync::atomic::Ordering;
use std::sync::Arc;

use agent::state::AgentState;
use tauri::Manager;

pub const AGENT_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const LOOPBACK_IP: std::net::Ipv4Addr = std::net::Ipv4Addr::LOCALHOST;

pub fn loopback_url(port: u16, path: &str) -> String {
    format!("http://{LOOPBACK_IP}:{port}{path}")
}

pub const LOOPBACK_PORTS: [u16; 5] = [47615, 47616, 47617, 47618, 47619];
pub const SHELL_PORT: u16 = 47620;

pub fn context() -> tauri::Context {
    tauri::generate_context!()
}

/// Runs the unified MiniAlgothon competitor client: bounds proctoring lifecycle directly
/// to the desktop application, activates lockdown kiosk mode during competition, and
/// enforces secondary monitor restrictions.
pub fn run() {
    let state = Arc::new(AgentState::new());

    let port = match agent::loopback::start(Arc::clone(&state)) {
        Some(port) => port,
        None => {
            log::warn!("another instance is already running; raising window");
            let _ = reqwest::blocking::Client::builder()
                .timeout(std::time::Duration::from_millis(500))
                .build()
                .ok()
                .and_then(|client| {
                    client
                        .post(format!("http://127.0.0.1:{SHELL_PORT}/show"))
                        .send()
                        .ok()
                });
            return;
        }
    };
    log::info!("proctor agent {} listening on port {port}", AGENT_VERSION);

    agent::scheduler::spawn(Arc::clone(&state));

    let setup_state = Arc::clone(&state);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::clone(&state))
        .invoke_handler(tauri::generate_handler![
            agent::commands::get_setup_state,
            agent::commands::save_server,
            agent::commands::fetch_disclosure,
            agent::commands::enroll_agent,
            agent::commands::get_diagnostics,
            agent::commands::open_contest_window,
            agent::commands::enter_contest,
            agent::commands::reset_enrollment,
            shell::commands::get_shell_target,
            shell::commands::get_lockdown_status,
            shell::commands::exit_competition,
            shell::commands::retry_connection,
            shell::commands::open_proctor_setup,
            shell::commands::minimize_window,
            shell::commands::toggle_maximize_window,
            shell::commands::close_window,
            shell::commands::is_window_maximized
        ])
        .setup(move |app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(if cfg!(debug_assertions) {
                        log::LevelFilter::Debug
                    } else {
                        log::LevelFilter::Info
                    })
                    .build(),
            )?;

            setup_state.set_app_handle(app.handle().clone());

            if setup_state.is_enrolled() {
                let _ = shell::create_contest_window(app.handle(), &setup_state);
            } else {
                agent::windows::open_setup(app.handle());
            }

            shell::monitors::start_monitor_watcher(
                app.handle().clone(),
                Arc::clone(&setup_state),
                Arc::new(std::sync::atomic::AtomicBool::new(false)),
            );

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    if window.label() == shell::MAIN_WINDOW {
                        if !shell::QUITTING.load(Ordering::Relaxed) {
                            api.prevent_close();
                            if let Some(webview_win) = window.app_handle().get_webview_window(shell::MAIN_WINDOW) {
                                let _ = webview_win.eval("window.dispatchEvent(new CustomEvent('minialgothon:request-exit'));");
                            }
                        }
                    } else if window.label() == agent::windows::DIAGNOSTICS_WINDOW {
                        api.prevent_close();
                        let _ = window.hide();
                    } else if window.label() == agent::windows::SETUP_WINDOW {
                        window.app_handle().exit(0);
                    }
                }
                tauri::WindowEvent::Focused(is_focused) => {
                    if window.label() == shell::MAIN_WINDOW && !shell::QUITTING.load(Ordering::Relaxed) {
                        if !*is_focused {
                            let _ = window.set_always_on_top(true);
                            let _ = window.set_focus();
                        }
                        shell::enable_kiosk(Some(window));
                    }
                }
                _ => {}
            }
        })
        .build(context())
        .expect("failed to build competitor client")
        .run(move |app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if state.is_enrolled() && !shell::QUITTING.load(Ordering::Relaxed) && !state.stopping.load(Ordering::Relaxed) {
                    api.prevent_exit();
                } else {
                    shell::disable_kiosk();
                    shell::monitors::clear_monitor_lockouts(app);
                    agent::scheduler::report_shutdown(&state, "application exiting");
                }
            }
        });
}
