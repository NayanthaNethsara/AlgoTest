// Prevents an extra console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--reset") {
        if let Ok(client) = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_millis(500))
            .build()
        {
            for port in app_lib::LOOPBACK_PORTS {
                let _ = client.post(app_lib::loopback_url(port, "/quit")).send();
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(700));
        let removed = app_lib::config::reset();
        println!("Agent reset. Removed {} item(s).", removed.len());
        return;
    }

    app_lib::config::ensure_current_version(app_lib::AGENT_VERSION);

    if let Some(port) = app_lib::agent::loopback::running_port() {
        if let Ok(client) = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_millis(500))
            .build()
        {
            if app_lib::config::load_enrollment().is_none() {
                let _ = client.post(app_lib::loopback_url(port, "/setup")).send();
            } else {
                let config = app_lib::config::load_client();
                if !config.server_url.is_empty() {
                    app_lib::agent::windows::open_in_browser(&config.server_url);
                }
            }
        }
        return;
    }

    app_lib::agent::run();
}
