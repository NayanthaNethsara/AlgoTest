// Prevents an extra console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--reset") {
        reset();
        return;
    }

    if !std::env::args().any(|arg| arg == "--agent") && is_shell_running() {
        if let Ok(client) = build_loopback_client(std::time::Duration::from_millis(500)) {
            send_loopback_post(&client, &app_lib::loopback_url(app_lib::SHELL_PORT, "/focus-main"));
        }
        return;
    }

    if std::env::args().any(|arg| arg == "--agent") {
        app_lib::agent::run();
        return;
    }

    // First run owns the agent process to show setup UI immediately.
    if app_lib::config::load_enrollment().is_none() {
        if app_lib::agent::loopback::is_agent_running() {
            if let Ok(client) = build_loopback_client(std::time::Duration::from_millis(400)) {
                for port in app_lib::LOOPBACK_PORTS {
                    send_loopback_post(&client, &app_lib::loopback_url(port, "/setup"));
                }
            }
            return;
        }
        app_lib::agent::run();
        return;
    }

    app_lib::shell::run();
}

fn reset() {
    if let Ok(client) = build_loopback_client(std::time::Duration::from_millis(500)) {
        for port in app_lib::LOOPBACK_PORTS {
            send_loopback_post(&client, &app_lib::loopback_url(port, "/quit"));
        }
        send_loopback_post(&client, &app_lib::loopback_url(app_lib::SHELL_PORT, "/quit"));
    }

    std::thread::sleep(std::time::Duration::from_millis(700));

    let removed = app_lib::config::reset();
    if removed.is_empty() {
        println!("Nothing to reset: no client data found on this machine.");
        return;
    }
    println!("Removed {} item(s):", removed.len());
    for item in removed {
        println!("  {item}");
    }
}

fn build_loopback_client(timeout: std::time::Duration) -> Result<reqwest::blocking::Client, reqwest::Error> {
    reqwest::blocking::Client::builder()
        .timeout(timeout)
        .build()
}

fn send_loopback_post(client: &reqwest::blocking::Client, url: &str) {
    let _ = client.post(url).send();
}

fn is_shell_running() -> bool {
    build_loopback_client(std::time::Duration::from_millis(300))
        .ok()
        .and_then(|c| c.get(app_lib::loopback_url(app_lib::SHELL_PORT, "/is-maximized")).send().ok())
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}
