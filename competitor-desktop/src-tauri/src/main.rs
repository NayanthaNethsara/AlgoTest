// Prevents an extra console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--reset") {
        reset();
        return;
    }

    let agent_only_mode = std::env::args().any(|arg| {
        arg == "--agent-only" || arg == "--headless" || arg == "--background" || arg == "--browser"
    });

    app_lib::run(agent_only_mode);
}


/// Restores the machine by stopping active proctoring and clearing saved credentials.
fn reset() {
    for port in app_lib::LOOPBACK_PORTS {
        request_quit(&app_lib::loopback_url(port, "/quit"));
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

fn request_quit(url: &str) {
    let _ = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_millis(500))
        .build()
        .ok()
        .and_then(|client| client.post(url).send().ok());
}
