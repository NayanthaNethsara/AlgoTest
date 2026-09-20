pub mod commands;
pub mod identity;
pub mod lifecycle;
pub mod loopback;
pub mod scheduler;
pub mod state;
pub mod transport;
pub mod tray;
pub mod windows;

use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::Manager;

use state::AgentState;

pub fn run() {
    crate::config::ensure_current_version(crate::AGENT_VERSION);

    let _instance_lock = match crate::acquire_process_lock("Local\\AlgothonAgentInstance") {
        Some(lock) => lock,
        None => {
            loopback::focus_existing();
            log::warn!("another proctor agent instance is already running; exiting");
            return;
        }
    };

    if loopback::is_agent_running() {
        loopback::focus_existing();
        log::warn!("another proctor agent is already running; exiting");
        return;
    }

    let state = Arc::new(AgentState::new());

    let port = match loopback::start(Arc::clone(&state)) {
        Some(port) => port,
        None => {
            log::error!("another proctor agent is already running; exiting");
            return;
        }
    };
    log::info!("proctor agent {} on port {port}", crate::AGENT_VERSION);

    scheduler::spawn(Arc::clone(&state));

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::clone(&state))
        .invoke_handler(tauri::generate_handler![
            commands::get_setup_state,
            commands::save_server,
            commands::fetch_disclosure,
            commands::enroll_agent,
            commands::get_diagnostics,
            commands::open_contest_window,
            commands::enter_contest,
            commands::trigger_heartbeat,
            commands::reconnect_agent,
            commands::reset_enrollment,
            commands::close_current_window,
        ]);

    let setup_state = Arc::clone(&state);
    builder
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
            tray::install(app.handle(), Arc::clone(&setup_state))?;
            lifecycle::sync_autostart(app.handle(), setup_state.is_enrolled());

            windows::open_diagnostics(app.handle());

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == windows::SETUP_WINDOW {
                if let tauri::WindowEvent::Resized(_) = event {
                    if window.is_minimized().unwrap_or(false) {
                        let _ = window.hide();
                    }
                }
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    lifecycle::request_exit(
                        window.app_handle(),
                        &window.state::<Arc<AgentState>>(),
                        "application window closed",
                    );
                }
            }
        })
        .build(crate::context())
        .expect("failed to build the proctor agent")
        .run(move |app, event| {
            if let tauri::RunEvent::ExitRequested { ref api, .. } = event {
                if !state.exit_ready.load(Ordering::Relaxed) {
                    api.prevent_exit();
                    lifecycle::request_exit(app, &state, "application quit");
                }
            }
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                windows::open_diagnostics(app);
            }
        });
}
