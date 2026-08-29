use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const BLACKOUT_LABEL_PREFIX: &str = "blackout-screen-";

/// Synchronizes blackout overlay windows on all connected secondary monitors.
pub fn sync_monitor_lockouts(app: &AppHandle) {
    let Ok(available_monitors) = app.available_monitors() else {
        return;
    };

    if available_monitors.len() <= 1 {
        clear_monitor_lockouts(app);
        return;
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
            let _ = existing_window.set_fullscreen(true);
        } else {
            let position = monitor.position();
            let scale_factor = monitor.scale_factor();
            let logical_x = position.x as f64 / scale_factor;
            let logical_y = position.y as f64 / scale_factor;
            let size = monitor.size();
            let logical_width = size.width as f64 / scale_factor;
            let logical_height = size.height as f64 / scale_factor;

            let builder = WebviewWindowBuilder::new(
                app,
                &label,
                WebviewUrl::App("blackout.html".into()),
            )
            .title("MiniAlgothon — Restricted Display")
            .position(logical_x, logical_y)
            .inner_size(logical_width, logical_height)
            .fullscreen(true)
            .always_on_top(true)
            .decorations(false)
            .resizable(false)
            .closable(false)
            .skip_taskbar(true);

            if let Err(err) = builder.build() {
                log::warn!("could not build blackout window on secondary display {label}: {err}");
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
}

/// Removes all secondary display blackout overlay windows.
pub fn clear_monitor_lockouts(app: &AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with(BLACKOUT_LABEL_PREFIX) {
            let _ = window.close();
        }
    }
}

/// Periodically syncs blackout windows to handle dynamically attached/detached screens.
pub fn start_monitor_watcher(app: AppHandle, is_quitting: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        while !is_quitting.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(1500));
            if is_quitting.load(Ordering::Relaxed) {
                break;
            }
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                sync_monitor_lockouts(&handle);
            });
        }
    });
}
