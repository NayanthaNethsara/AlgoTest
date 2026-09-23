// Prevents an extra console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--reset") {
        reset();
        return;
    }

    app_lib::config::ensure_current_version(app_lib::AGENT_VERSION);

    if let Some(port) = app_lib::agent::loopback::running_port() {
        if let Ok(client) = build_loopback_client(std::time::Duration::from_millis(500)) {
            send_loopback_post(&client, &app_lib::loopback_url(port, "/setup"));
        }
        return;
    }

    app_lib::agent::run();
}

fn reset() {
    if let Ok(client) = build_loopback_client(std::time::Duration::from_millis(500)) {
        for port in app_lib::LOOPBACK_PORTS {
            send_loopback_post(&client, &app_lib::loopback_url(port, "/quit"));
        }
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

fn build_loopback_client(
    timeout: std::time::Duration,
) -> Result<reqwest::blocking::Client, reqwest::Error> {
    reqwest::blocking::Client::builder()
        .timeout(timeout)
        .build()
}

fn send_loopback_post(client: &reqwest::blocking::Client, url: &str) {
    let _ = client.post(url).send();
}
