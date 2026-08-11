// Prevents an extra console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--reset") {
        reset();
        return;
    }

    // One binary, two roles. The proctor agent must outlive any UI, so it runs as
    // its own process: a crash or a bad deploy in the contest shell can then cost
    // a contestant nothing more than a window.
    if std::env::args().any(|arg| arg == "--agent") {
        app_lib::agent::run();
        return;
    }

    // First run owns the agent process rather than delegating to a detached child
    // and exiting. Launching a background process and quitting looks exactly like
    // a crash — an empty window and no explanation — and an unenrolled contestant
    // cannot submit anything, so setup is the only useful thing to show.
    // The target is compiled in, so enrolment is the only thing a first run is
    // ever missing.
    if app_lib::config::load_enrollment().is_none() {
        app_lib::agent::run();
        return;
    }

    app_lib::shell::run();
}

/// Puts the machine back the way it was before this client ever ran.
///
/// The agent is built to survive being closed — it autostarts, and the shell
/// relaunches it — which is correct in a contest hall and miserable on a laptop
/// running the app twenty times a day. Anything still running is asked to stop
/// first, because a live agent rewrites the files this is about to delete.
fn reset() {
    for port in app_lib::LOOPBACK_PORTS {
        request_quit(&app_lib::loopback_url(port, "/quit"));
    }
    request_quit(&app_lib::loopback_url(app_lib::SHELL_PORT, "/quit"));

    // Long enough for a stopping agent to release its files, short enough that a
    // machine with nothing running does not feel like it hung.
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
