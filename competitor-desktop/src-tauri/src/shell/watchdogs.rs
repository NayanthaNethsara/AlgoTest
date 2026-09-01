use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{Manager, WebviewWindow};

use crate::shell::{MAIN_WINDOW, QUITTING};
use crate::{LOOPBACK_PORTS, SHELL_PORT};

pub const PROBE_TIMEOUT: Duration = Duration::from_secs(4);

pub fn spawn_focus_watchdog(focus_window: WebviewWindow) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_millis(200));
            if QUITTING.load(Ordering::Relaxed) {
                break;
            }
            if let Ok(is_full) = focus_window.is_fullscreen() {
                if !is_full && !QUITTING.load(Ordering::Relaxed) {
                    let _ = focus_window.set_fullscreen(true);
                }
            }
            if let Ok(is_focus) = focus_window.is_focused() {
                if !is_focus && !QUITTING.load(Ordering::Relaxed) {
                    crate::shell::lockdown::force_foreground_focus(&focus_window);
                }
            }
        }
    });
}

pub fn spawn_monitor_watchdog(app: tauri::AppHandle, server_url: String) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_millis(500));
            if QUITTING.load(Ordering::Relaxed) {
                break;
            }

            let monitor_count = app.available_monitors().map(|m| m.len()).unwrap_or(1);
            let is_multimonitor = monitor_count > 1;

            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                if let Ok(url) = window.url() {
                    let url_str = url.as_str();
                    let is_showing_multimonitor = url_str.contains("multimonitor.html");

                    if is_multimonitor && !is_showing_multimonitor {
                        log::warn!("multiple displays detected ({monitor_count}); blocking contest access");
                        let _ = window.navigate(local_app_url("multimonitor.html"));
                    } else if !is_multimonitor && is_showing_multimonitor {
                        log::info!("single display restored; restoring contest portal");
                        if !server_url.is_empty() {
                            let _ = window.navigate(portal_entry_url(&server_url));
                        }
                    }
                }
            }
        }
    });
}

pub fn spawn_agent_watchdog() {
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

            if consecutive_failures == 3 && crate::config::load_enrollment().is_some() {
                log::warn!("proctor agent unreachable; relaunching it");
                launch_agent();
            }
        }
    });
}

pub fn spawn_portal_watchdog(app: tauri::AppHandle, server_url: String) {
    if server_url.is_empty() {
        return;
    }

    std::thread::spawn(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_millis(1500))
            .build()
            .unwrap_or_default();
        let mut consecutive_failures = 0u32;

        loop {
            std::thread::sleep(Duration::from_secs(4));

            if QUITTING.load(Ordering::Relaxed) {
                break;
            }

            let reachable = client
                .get(&server_url)
                .send()
                .map(|r| !r.status().is_server_error())
                .unwrap_or(false);

            if reachable {
                consecutive_failures = 0;
            } else {
                consecutive_failures += 1;
                if consecutive_failures >= 2 {
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        if let Ok(url) = window.url() {
                            if !url.as_str().contains("unreachable.html") {
                                log::warn!("portal server unreachable ({consecutive_failures} failed checks); showing offline screen");
                                let _ = window.navigate(local_app_url("unreachable.html"));
                            }
                        }
                    }
                }
            }
        }
    });
}

pub fn launch_agent() {
    match std::env::current_exe() {
        Ok(exe) => {
            if let Err(err) = std::process::Command::new(exe).arg("--agent").spawn() {
                log::error!("could not launch the proctor agent: {err}");
            }
        }
        Err(err) => log::error!("could not locate the client executable: {err}"),
    }
}

pub fn request_show() {
    let _ = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(500))
        .build()
        .ok()
        .and_then(|client| client.post(crate::loopback_url(SHELL_PORT, "/show")).send().ok());
}

pub fn probe(server_url: &str) -> Result<(), String> {
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

pub fn portal_entry_url(server_url: &str) -> tauri::Url {
    let mut url: tauri::Url = server_url.parse().expect("validated before the window is built");
    url.query_pairs_mut().append_pair("client", "desktop");
    url
}

pub fn local_app_url(file: &str) -> tauri::Url {
    #[cfg(target_os = "windows")]
    let base = "http://tauri.localhost/";
    #[cfg(not(target_os = "windows"))]
    let base = "tauri://localhost/";
    tauri::Url::parse(&format!("{base}{file}"))
        .unwrap_or_else(|_| tauri::Url::parse("tauri://localhost/").unwrap())
}
