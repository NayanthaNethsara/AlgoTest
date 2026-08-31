use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::agent::state::AgentState;

const BLACKOUT_LABEL_PREFIX: &str = "blackout-screen-";

pub static MAIN_WINDOW_LOCKED_OUT: AtomicBool = AtomicBool::new(false);

/// Synchronizes blackout overlay windows on all connected secondary monitors,
/// and swaps the primary contest window between multidisplay.html and the contest portal.
pub fn sync_monitor_lockouts(app: &AppHandle, state: &Arc<AgentState>) {
    if state.is_agent_only_mode() {
        clear_monitor_lockouts(app);
        return;
    }

    let Ok(available_monitors) = app.available_monitors() else {
        return;
    };


    if available_monitors.len() <= 1 {
        clear_monitor_lockouts(app);
        if MAIN_WINDOW_LOCKED_OUT.swap(false, Ordering::Relaxed) {
            if let Some(win) = app.get_webview_window("contest") {
                let server_url = state.server_url();
                let _ = win.navigate(super::portal_entry_url(&server_url));
            }
        }
        super::sync_notch_cover(app);
        return;
    }

    if !MAIN_WINDOW_LOCKED_OUT.swap(true, Ordering::Relaxed) {
        if let Some(win) = app.get_webview_window("contest") {
            let _ = win.navigate(super::local_app_url("multidisplay.html"));
        }
    }

    let primary_monitor = app
        .get_webview_window("contest")
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());

    let primary_position = primary_monitor.as_ref().map(|m| *m.position());

    let mut active_labels = Vec::new();
    let mut secondary_index = 0;

    for monitor in &available_monitors {
        let is_primary = primary_position
            .map(|pos| pos.x == monitor.position().x && pos.y == monitor.position().y)
            .unwrap_or(false);

        if is_primary {
            continue;
        }

        let label = format!("{BLACKOUT_LABEL_PREFIX}{secondary_index}");
        active_labels.push(label.clone());
        secondary_index += 1;

        if let Some(existing_window) = app.get_webview_window(&label) {
            let _ = existing_window.show();
            let _ = existing_window.set_always_on_top(true);
            #[cfg(not(target_os = "macos"))]
            let _ = existing_window.set_fullscreen(true);
        } else {
            let position = monitor.position();
            let scale_factor = monitor.scale_factor();
            let logical_x = position.x as f64 / scale_factor;
            let logical_y = position.y as f64 / scale_factor;
            let size = monitor.size();
            let logical_width = size.width as f64 / scale_factor;
            let logical_height = size.height as f64 / scale_factor;

            #[cfg(target_os = "macos")]
            let is_native_fullscreen = false;
            #[cfg(not(target_os = "macos"))]
            let is_native_fullscreen = true;

            let builder = WebviewWindowBuilder::new(
                app,
                &label,
                WebviewUrl::App("blackout.html".into()),
            )
            .title("MiniAlgothon — Restricted Display")
            .position(logical_x, logical_y)
            .inner_size(logical_width, logical_height)
            .fullscreen(is_native_fullscreen)
            .always_on_top(true)
            .decorations(false)
            .resizable(false)
            .closable(false)
            .skip_taskbar(true);

            match builder.build() {
                Ok(blackout_win) => {
                    super::enable_kiosk(Some(&blackout_win.as_ref().window()));
                }
                Err(err) => {
                    log::warn!("could not build blackout window on secondary display {label}: {err}");
                }
            }
        }
    }

    // Close any stale blackout windows for disconnected monitors
    for i in secondary_index..16 {
        let stale_label = format!("{BLACKOUT_LABEL_PREFIX}{i}");
        if let Some(stale_window) = app.get_webview_window(&stale_label) {
            let _ = stale_window.close();
        }
    }

    super::sync_notch_cover(app);
}

/// Removes all secondary display blackout overlay windows.
pub fn clear_monitor_lockouts(app: &AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with(BLACKOUT_LABEL_PREFIX) {
            let _ = window.close();
        }
    }
}

static LAST_MONITOR_COUNT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

/// Periodically syncs blackout windows to handle dynamically attached/detached screens.
pub fn start_monitor_watcher(app: AppHandle, state: Arc<AgentState>, is_quitting: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        while !is_quitting.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(800));
            if is_quitting.load(Ordering::Relaxed) {
                break;
            }
            let count = app.available_monitors().map(|m| m.len()).unwrap_or(1);
            let prev = LAST_MONITOR_COUNT.swap(count, Ordering::Relaxed);
            if count != prev || (count > 1 && app.get_webview_window("blackout-screen-0").is_none()) {
                let handle = app.clone();
                let state_clone = Arc::clone(&state);
                let _ = app.run_on_main_thread(move || {
                    sync_monitor_lockouts(&handle, &state_clone);
                });
            }
        }
    });
}
