use std::sync::atomic::Ordering;
use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use super::state::{AgentState, TickLog};
use super::transport::Transport;
use super::{identity, windows};
use crate::config::{self, ClientConfig};

#[derive(Serialize)]
pub struct SetupState {
    configured: bool,
    enrolled: bool,
    server_url: String,
    api_url: String,
    username: String,
    machine_id: String,
    agent_version: String,
}

#[tauri::command]
pub fn get_setup_state(state: State<'_, Arc<AgentState>>) -> SetupState {
    let client = state.client.lock().ok().and_then(|c| c.clone());
    let enrollment = state.enrollment.lock().ok().and_then(|e| e.clone());

    SetupState {
        configured: client.is_some(),
        enrolled: enrollment.is_some(),
        server_url: client.as_ref().map(|c| c.server_url.clone()).unwrap_or_default(),
        api_url: client.as_ref().map(|c| c.api_url.clone()).unwrap_or_default(),
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
    };
    if cfg.server_url.is_empty() || cfg.api_url.is_empty() {
        return Err("both the portal and API address are required".into());
    }
    reqwest::Url::parse(&cfg.server_url).map_err(|e| format!("portal address: {e}"))?;
    reqwest::Url::parse(&cfg.api_url).map_err(|e| format!("API address: {e}"))?;

    config::save_client(&cfg)?;
    if let Ok(mut slot) = state.client.lock() {
        *slot = Some(cfg);
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
    app: tauri::AppHandle,
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
    state.log("enrolled", format!("agent enrolled as {}", username.trim()));

    windows::close_setup(&app);
    windows::open_contest_shell(&state);
    Ok(())
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
        boot_id: state.boot_id.clone(),
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
    config::clear_enrollment()?;
    if let Ok(mut slot) = state.enrollment.lock() {
        *slot = None;
    }
    state.revoked.store(false, Ordering::Relaxed);
    windows::open_setup(&app);
    Ok(())
}
