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

use tauri_plugin_autostart::MacosLauncher;

use state::AgentState;

/// Runs the proctor agent: no visible window by default, a tray icon for its whole
/// lifetime, and a loopback server the portal can use to prove co-location.
pub fn run() {
    let state = Arc::new(AgentState::new());

    // The loopback bind is also the single-instance lock. Two agents would produce
    // two heartbeat sequences for one contestant and read as a replay attack.
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
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            // Autostart brings back only the agent, never the contest window: a
            // mid-contest reboot must restore proctoring without stealing focus.
            Some(vec!["--agent"]),
        ))
        .manage(Arc::clone(&state))
        .invoke_handler(tauri::generate_handler![
            commands::get_setup_state,
            commands::save_server,
            commands::fetch_disclosure,
            commands::enroll_agent,
            commands::get_diagnostics,
            commands::open_contest_window,
            commands::enter_contest,
            commands::reset_enrollment,
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
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            // An unconfigured or unenrolled agent is the one case that needs a
            // window: it cannot report anything until a contestant enrols it.
            if !setup_state.is_enrolled() {
                windows::open_setup(app.handle());
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Setup and diagnostics are disposable panels. Closing one must never
            // take the agent down with it.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == windows::DIAGNOSTICS_WINDOW {
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
