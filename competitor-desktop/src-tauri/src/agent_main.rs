// Prevents an extra console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--reset") {
        for port in app_lib::LOOPBACK_PORTS {
            request_quit(&app_lib::loopback_url(port, "/quit"));
        }
        let removed = app_lib::config::reset();
        println!("Agent reset. Removed {} item(s).", removed.len());
        return;
    }

    app_lib::agent::run();
}

fn request_quit(url: &str) {
    let _ = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_millis(500))
        .build()
        .ok()
        .and_then(|client| client.post(url).send().ok());
}
