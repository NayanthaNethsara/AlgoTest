use std::sync::atomic::Ordering;
use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use super::state::{AgentState, TickLog};
use super::transport::Transport;
use super::{identity, lifecycle, windows};
use crate::config::{self, ClientConfig};

#[derive(Serialize)]
pub struct SetupState {
    enrolled: bool,
    server_url: String,
    api_url: String,
    username: String,
    machine_id: String,
    agent_version: String,
}

#[tauri::command]
pub fn get_setup_state(state: State<'_, Arc<AgentState>>) -> SetupState {
    let enrollment = state.enrollment.lock().ok().and_then(|e| e.clone());

    SetupState {
        enrolled: enrollment.is_some(),
        server_url: state.server_url(),
        api_url: state.api_url(),
        username: enrollment.as_ref().map(|e| e.username.clone()).unwrap_or_default(),
        machine_id: identity::machine_id(),
        agent_version: crate::AGENT_VERSION.to_string(),
    }
}

#[tauri::command]
pub fn save_server(server_url: String, api_url: String, state: State<'_, Arc<AgentState>>) -> Result<(), String> {
    let cfg = ClientConfig {
        server_url: server_url.trim().trim_end_matches('/').to_string(),
        api_url: api_url.trim().trim_end_matches('/').to_string(),
        // Preserved: the standby origins come from the build, not from this form.
        portal_origins: state.portal_origins(),
    };
    if cfg.server_url.is_empty() || cfg.api_url.is_empty() {
        return Err("both the portal and API address are required".into());
    }
    reqwest::Url::parse(&cfg.server_url).map_err(|e| format!("portal address: {e}"))?;
    reqwest::Url::parse(&cfg.api_url).map_err(|e| format!("API address: {e}"))?;

    config::save_client(&cfg)?;
    if let Ok(mut slot) = state.client.lock() {
        *slot = cfg;
    }
    Ok(())
}

#[tauri::command]
pub fn fetch_disclosure(state: State<'_, Arc<AgentState>>) -> Result<serde_json::Value, String> {
    let api_url = state.api_url();
    if api_url.is_empty() {
        return Err("set the contest server address first".into());
    }
    Transport::new().disclosure(&api_url)
}

#[tauri::command]
pub fn enroll_agent(
    username: String,
    password: String,
    consent_version: String,
    _app: tauri::AppHandle,
    state: State<'_, Arc<AgentState>>,
) -> Result<(), String> {
    let api_url = state.api_url();
    if api_url.is_empty() {
        return Err("set the contest server address first".into());
    }

    let (enrollment, policy) = Transport::new().enroll(
        &api_url,
        username.trim(),
        &password,
        &identity::machine_id(),
        &identity::platform(),
        &consent_version,
    )?;

    config::save_enrollment(&enrollment)?;
    if let Ok(mut slot) = state.enrollment.lock() {
        *slot = Some(enrollment);
    }
    if let Ok(mut slot) = state.policy.lock() {
        *slot = policy;
    }
    state.revoked.store(false, Ordering::Relaxed);
    // Reporting starts now, not when the process launched. Without this, a
    // contestant who spent a minute reading the disclosure lands on a portal that
    // has already given up waiting for the first heartbeat.
    state.mark_reporting_start();
    state.force_heartbeat();
    state.log("enrolled", format!("agent enrolled as {}", username.trim()));

    Ok(())
}

/// Cross-platform helper to launch a URL in the user's default web browser.
pub fn open_url_in_browser(url: &str) -> Result<(), String> {
    if url.is_empty() {
        return Err("cannot open empty URL".into());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
    }
    Ok(())
}

/// Closes setup and opens the contest window. Called by the setup page once it has
/// seen the agent report in.
#[tauri::command]
pub fn enter_contest(app: tauri::AppHandle, state: State<'_, Arc<AgentState>>) {
    state.set_agent_only_mode(false);
    windows::close_setup(&app);
    windows::open_contest_shell(state.inner());
}

/// Closes setup, sets agent-only mode, and opens the contest portal in the default browser.
#[tauri::command]
pub fn enter_browser_mode(app: tauri::AppHandle, state: State<'_, Arc<AgentState>>) -> Result<(), String> {
    state.set_agent_only_mode(true);
    let server_url = state.server_url();
    windows::close_setup(&app);
    open_url_in_browser(&server_url)
}


#[derive(Serialize)]
pub struct Diagnostics {
    status: String,
    agent_version: String,
    boot_id: String,
    support_code: String,
    uptime_seconds: u64,
    enrolled: bool,
    revoked: bool,
    username: String,
    machine_id: String,
    platform: String,
    server_url: String,
    api_url: String,
    loopback_port: u16,
    seq: u64,
    healthy: bool,
    seconds_since_ack: Option<u64>,
    buffered_heartbeats: usize,
    shell_alive: bool,
    last_error: Option<String>,
    internet_reachable: bool,
    inference_ports: Vec<String>,
    process_matches: Vec<String>,
    history: Vec<TickLog>,
}

#[tauri::command]
pub fn get_diagnostics(state: State<'_, Arc<AgentState>>) -> Diagnostics {
    let enrollment = state.enrollment.lock().ok().and_then(|e| e.clone());
    let signals = state.last_signals();

    Diagnostics {
        status: state.status_label().to_string(),
        agent_version: crate::AGENT_VERSION.to_string(),
        boot_id: state.boot_id(),
        support_code: state.support_code(),
        uptime_seconds: state.uptime_seconds(),
        enrolled: enrollment.is_some(),
        revoked: state.revoked.load(Ordering::Relaxed),
        username: enrollment.as_ref().map(|e| e.username.clone()).unwrap_or_default(),
        machine_id: enrollment
            .as_ref()
            .map(|e| e.machine_id.clone())
            .unwrap_or_else(identity::machine_id),
        platform: identity::platform(),
        server_url: state.server_url(),
        api_url: state.api_url(),
        loopback_port: state.loopback_port.load(Ordering::Relaxed),
        seq: state.seq.load(Ordering::Relaxed),
        healthy: state.healthy(),
        seconds_since_ack: state.seconds_since_ack(),
        buffered_heartbeats: state.buffer_len(),
        shell_alive: state.shell_alive(),
        last_error: state.last_error.lock().ok().and_then(|e| e.clone()),
        internet_reachable: signals.internet_reachable,
        inference_ports: signals
            .ports
            .iter()
            .filter(|p| p.confirmed)
            .map(|p| format!("{} on {}", p.product, p.port))
            .collect(),
        process_matches: signals.process_matches,
        history: state.history(),
    }
}

#[tauri::command]
pub fn open_contest_window(state: State<'_, Arc<AgentState>>) {
    windows::open_contest_shell(&state);
}

#[tauri::command]
pub fn reset_enrollment(app: tauri::AppHandle, state: State<'_, Arc<AgentState>>) -> Result<(), String> {
    lifecycle::unenroll(&app, state.inner(), "enrollment reset from the diagnostics window")?;
    windows::open_setup(&app);
    Ok(())
}
