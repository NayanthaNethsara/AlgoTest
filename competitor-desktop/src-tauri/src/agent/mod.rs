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

use state::AgentState;

pub fn run() {
    crate::config::ensure_current_version(crate::AGENT_VERSION);

    let _instance_lock = match crate::acquire_process_lock("Local\\AlgothonAgentInstance") {
        Some(lock) => lock,
        None => {
            log::warn!("another proctor agent instance is already running; exiting");
            return;
        }
    };

    if loopback::is_agent_running() {
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

            #[cfg(target_os = "macos")]
            if setup_state.is_enrolled() {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            if !setup_state.is_enrolled() {
                windows::open_setup(app.handle());
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == windows::DIAGNOSTICS_WINDOW || window.label() == windows::SETUP_WINDOW {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(crate::context())
        .expect("failed to build the proctor agent")
        .run(move |_app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if state.is_enrolled() && !state.stopping.load(Ordering::Relaxed) {
                    api.prevent_exit();
                } else if !state.stopping.swap(true, Ordering::Relaxed) {
                    scheduler::report_shutdown(&state, "agent process exiting");
                }
            }
        });
}
