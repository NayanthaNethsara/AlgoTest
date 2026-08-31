use std::io::{Read, Write};
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

use crate::shell::watchdogs::local_app_url;
use crate::shell::{MAIN_WINDOW, QUITTING};

pub fn spawn_control_listener(listener: std::net::TcpListener, app: tauri::AppHandle) {
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };

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
                Some("/request-exit") | Some("/leave-dialog") => {
                    let app_handle = app.clone();
                    app.dialog()
                        .message("Are you sure you want to leave the competition and exit the application?\n\nExiting will lock your competition account. An administrator will need to grant you access from the Admin Console before you can re-enter.")
                        .title("Exit Competition Lockdown?")
                        .buttons(MessageDialogButtons::OkCancelCustom(
                            "Exit Competition".to_string(),
                            "Cancel & Stay".to_string(),
                        ))
                        .show(move |confirmed| {
                            if confirmed {
                                crate::shell::window::restore_macos_presentation_options();
                                QUITTING.store(true, Ordering::Relaxed);
                                if let Some(window) = app_handle.get_webview_window(MAIN_WINDOW) {
                                    let _ = window.set_always_on_top(false);
                                    let _ = window.set_fullscreen(false);
                                }
                                app_handle.exit(0);
                            }
                        });
                }
                Some("/leave") | Some("/quit") | Some("/force-quit") => {
                    crate::shell::window::restore_macos_presentation_options();
                    QUITTING.store(true, Ordering::Relaxed);
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        let _ = window.set_always_on_top(false);
                        let _ = window.set_fullscreen(false);
                    }
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
