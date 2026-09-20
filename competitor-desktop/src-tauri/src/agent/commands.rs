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
    binary_hash: String,
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
        binary_hash: identity::current_exe_hash(),
    }
}

#[tauri::command]
pub fn save_server(server_url: String, api_url: String, state: State<'_, Arc<AgentState>>) -> Result<(), String> {
    let cfg = ClientConfig {
        server_url: server_url.trim().trim_end_matches('/').to_string(),
        api_url: api_url.trim().trim_end_matches('/').to_string(),
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
pub async fn fetch_disclosure(
    state: State<'_, Arc<AgentState>>,
) -> Result<serde_json::Value, String> {
    let api_url = state.api_url();
    if api_url.is_empty() {
        return Err("set the contest server address first".into());
    }
    tauri::async_runtime::spawn_blocking(move || Transport::new().disclosure(&api_url))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn enroll_agent(
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

    let trimmed_user = username.trim();
    if trimmed_user.is_empty() {
        return Err("username cannot be empty".into());
    }

    let username = trimmed_user.to_string();
    let enrollment_username = username.clone();
    let (enrollment, policy) = tauri::async_runtime::spawn_blocking(move || {
        let effective_consent = if consent_version.trim().is_empty() || consent_version == "unknown"
        {
            Transport::new()
                .disclosure(&api_url)
                .ok()
                .and_then(|disc| {
                    disc.get("disclosure")
                        .and_then(|d| d.get("version"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or(consent_version)
        } else {
            consent_version
        };

        Transport::new().enroll(
            &api_url,
            &enrollment_username,
            &password,
            &identity::machine_id(),
            &identity::platform(),
            &effective_consent,
            &identity::current_exe_hash(),
        )
    })
    .await
    .map_err(|e| e.to_string())??;

    config::save_enrollment(&enrollment)?;
    if let Ok(mut slot) = state.enrollment.lock() {
        *slot = Some(enrollment);
    }
    if let Ok(mut slot) = state.policy.lock() {
        *slot = policy;
    }
    state.revoked.store(false, Ordering::Relaxed);
    state.mark_reporting_start();
    state.force_heartbeat();
    state.log("enrolled", format!("agent enrolled as {username}"));

    Ok(())
}

#[tauri::command]
pub async fn enter_contest(app: tauri::AppHandle, state: State<'_, Arc<AgentState>>) -> Result<(), String> {
    windows::close_setup(&app);
    let state_inner = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        windows::open_contest_portal(&state_inner);
    })
    .await
    .map_err(|e| e.to_string())
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
    foreground_monitoring: bool,
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
        shell_alive: false,
        last_error: state.last_error.lock().ok().and_then(|e| e.clone()),
        internet_reachable: signals.internet_reachable,
        inference_ports: signals
            .ports
            .iter()
            .filter(|p| p.confirmed)
            .map(|p| format!("{} on {}", p.product, p.port))
            .collect(),
        process_matches: signals.process_matches,
        foreground_monitoring: cfg!(any(target_os = "macos", target_os = "windows")),
        history: state.history(),
    }
}

#[tauri::command]
pub fn open_contest_window(state: State<'_, Arc<AgentState>>) {
    windows::open_contest_portal(&state);
}

#[tauri::command]
pub async fn reset_enrollment(app: tauri::AppHandle, state: State<'_, Arc<AgentState>>) -> Result<(), String> {
    let app_handle = app.clone();
    let state_inner = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        lifecycle::unenroll(&app_handle, &state_inner, "enrollment reset from the diagnostics window")
    })
    .await
    .map_err(|e| e.to_string())??;

    windows::open_setup(&app);
    Ok(())
}

#[tauri::command]
pub fn trigger_heartbeat(state: State<'_, Arc<AgentState>>) {
    state.force_heartbeat();
}

#[tauri::command]
pub async fn reconnect_agent(state: State<'_, Arc<AgentState>>) -> Result<(), String> {
    let state_inner = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let api_url = state_inner.api_url();
        let token = state_inner
            .token()
            .ok_or_else(|| "this machine is not enrolled".to_string())?;
        state_inner.force_heartbeat();
        let policy = Transport::new()
            .policy(&api_url, &token)
            .map_err(|e| e.message())?;
        if let Ok(mut slot) = state_inner.policy.lock() {
            *slot = policy;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn close_current_window(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == windows::SETUP_WINDOW || window.label() == windows::DIAGNOSTICS_WINDOW {
        window.hide().map_err(|e| e.to_string())
    } else {
        window.close().map_err(|e| e.to_string())
    }
}
