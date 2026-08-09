// Prevents an extra console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
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
    let configured = app_lib::config::load_client().is_some();
    let enrolled = app_lib::config::load_enrollment().is_some();
    if !configured || !enrolled {
        app_lib::agent::run();
        return;
    }

    app_lib::shell::run();
}
