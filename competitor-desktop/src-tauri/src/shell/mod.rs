use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::WebviewUrl;

use crate::config::ClientConfig;
use crate::SHELL_PORT;

pub mod commands;
pub mod lockdown;
pub mod loopback;
pub mod scripts;
pub mod watchdogs;
pub mod window;

pub const MAIN_WINDOW: &str = "contest";

pub static QUITTING: AtomicBool = AtomicBool::new(false);

pub struct ShellState {
    pub config: Mutex<ClientConfig>,
    pub message: Mutex<String>,
}

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
            watchdogs::request_show();
            return;
        }
    };

    if !crate::agent::loopback::agent_already_running() {
        watchdogs::launch_agent();
    }

    let (target, message) = match watchdogs::probe(&config.server_url) {
        Ok(()) => (
            WebviewUrl::External(watchdogs::portal_entry_url(&config.server_url)),
            String::new(),
        ),
        Err(err) => {
            log::warn!("portal unreachable at {}: {err}", config.server_url);
            (WebviewUrl::App("unreachable.html".into()), err)
        }
    };

    let state = ShellState {
        config: Mutex::new(config),
        message: Mutex::new(message),
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::get_shell_target,
            commands::retry_connection,
            commands::open_proctor_setup,
            commands::minimize_window,
            commands::toggle_maximize_window,
            commands::close_window,
            commands::is_window_maximized
        ])
        .setup(move |app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;
            app.handle().plugin(tauri_plugin_dialog::init())?;

            let contest_window = window::build_contest_window(app.handle(), target)?;

            watchdogs::spawn_focus_watchdog(contest_window.clone());
            loopback::spawn_control_listener(listener, app.handle().clone());
            watchdogs::spawn_agent_watchdog();
            watchdogs::spawn_portal_watchdog(app.handle().clone(), configured_server_url.clone());

            let _ = contest_window.set_always_on_top(true);
            let _ = contest_window.set_focus();
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    if !QUITTING.load(Ordering::Relaxed) {
                        api.prevent_close();
                        let _ = window.set_always_on_top(true);
                        let _ = window.set_focus();
                    }
                }
                tauri::WindowEvent::Focused(focused) => {
                    if !*focused && !QUITTING.load(Ordering::Relaxed) {
                        let w = window.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(Duration::from_millis(50));
                            if !QUITTING.load(Ordering::Relaxed) {
                                let _ = w.set_always_on_top(true);
                            }
                        });
                    }
                }
                tauri::WindowEvent::Resized(..) => {
                    if !QUITTING.load(Ordering::Relaxed) {
                        if let Ok(is_full) = window.is_fullscreen() {
                            if !is_full {
                                let _ = window.set_fullscreen(true);
                            }
                        }
                    }
                }
                _ => {}
            }
        })
        .run(crate::context())
        .expect("failed to run the contest shell");
}
