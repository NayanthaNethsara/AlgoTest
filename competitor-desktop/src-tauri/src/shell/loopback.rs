use std::io::{Read, Write};
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::Manager;

use crate::shell::watchdogs::local_app_url;
use crate::shell::{MAIN_WINDOW, QUITTING};

pub fn spawn_control_listener(
    listener: std::net::TcpListener,
    app: tauri::AppHandle,
    allowed_origins: String,
) {
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };

            let mut scratch = [0u8; 1024];
            let _ = stream.set_read_timeout(Some(Duration::from_millis(200)));
            let read = stream.read(&mut scratch).unwrap_or(0);
            let Some((method, path)) = request_method_and_path(&scratch[..read]) else {
                continue;
            };

            let request_origin = request_header(&scratch[..read], "Origin");
            let cors_origin = match &request_origin {
                Some(origin) if is_origin_allowed(origin, &allowed_origins) => {
                    Some(origin.clone())
                }
                Some(_) => {
                    let reply = b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                    let _ = stream.write_all(reply);
                    let _ = stream.flush();
                    continue;
                }
                None => None,
            };

            let origin_header = match &cors_origin {
                Some(origin) => format!("Access-Control-Allow-Origin: {origin}\r\n"),
                None => String::new(),
            };

            if method == "OPTIONS" {
                let reply = format!(
                    "HTTP/1.1 204 No Content\r\n{}Access-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                    origin_header
                );
                let _ = stream.write_all(reply.as_bytes());
                let _ = stream.flush();
                continue;
            }

            let is_max = app
                .get_webview_window(MAIN_WINDOW)
                .and_then(|w| w.is_maximized().ok())
                .unwrap_or(false);

            if path == "/is-maximized" {
                let body = format!("{{\"maximized\":{}}}", is_max);
                let reply = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
                    origin_header,
                    body.len(),
                    body
                );
                let _ = stream.write_all(reply.as_bytes());
                let _ = stream.flush();
                continue;
            }

            let reply = format!(
                "HTTP/1.1 204 No Content\r\n{}Access-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                origin_header
            );
            let _ = stream.write_all(reply.as_bytes());
            let _ = stream.flush();

            match path.as_str() {
                "/request-exit" | "/leave-dialog" => {
                    crate::shell::lockdown::prompt_native_exit(&app);
                }
                "/leave" | "/quit" | "/force-quit" => {
                    crate::shell::lockdown::restore_platform_lockdown();
                    crate::shell::watchdogs::close_curtain_windows(&app, 0);
                    QUITTING.store(true, Ordering::Relaxed);
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        let _ = window.set_always_on_top(false);
                        let _ = window.set_fullscreen(false);
                    }
                    app.exit(0);
                    return;
                }
                "/minimize" => {
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        let _ = window.minimize();
                    }
                }
                "/toggle-maximize" | "/maximize" => {
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        if window.is_maximized().unwrap_or(false) {
                            let _ = window.unmaximize();
                        } else {
                            let _ = window.maximize();
                        }
                    }
                }
                "/close" => {
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        let _ = window.hide();
                    }
                }
                "/drag" => {
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        let _ = window.start_dragging();
                    }
                }
                "/offline" | "/unreachable" => {
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        let _ = window.navigate(local_app_url("unreachable.html"));
                    }
                }
                "/focus-main" | "/focus" => {
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_always_on_top(true);
                        let _ = window.set_focus();
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

fn request_method_and_path(bytes: &[u8]) -> Option<(String, String)> {
    let line = std::str::from_utf8(bytes).ok()?.lines().next()?;
    let mut parts = line.split_whitespace();
    let method = parts.next()?.to_uppercase();
    let target = parts.next()?;
    let path = target.split('?').next().unwrap_or(target).to_string();
    Some((method, path))
}

fn request_header(bytes: &[u8], header_name: &str) -> Option<String> {
    let text = std::str::from_utf8(bytes).ok()?;
    for line in text.lines().skip(1) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            break;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            if k.trim().eq_ignore_ascii_case(header_name) {
                return Some(v.trim().to_string());
            }
        }
    }
    None
}

fn is_origin_allowed(origin: &str, allowed_origins: &str) -> bool {
    if origin == "tauri://localhost"
        || origin == "http://tauri.localhost"
        || origin == "https://tauri.localhost"
        || origin.starts_with("tauri://")
    {
        return true;
    }
    crate::config::origin_matches(allowed_origins, origin)
}
