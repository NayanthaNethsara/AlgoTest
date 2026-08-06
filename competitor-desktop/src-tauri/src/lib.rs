use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use sysinfo::System;
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppConfig {
    pub server_url: String,
    pub api_url: String,
}

#[derive(Clone)]
pub struct TelemetryState {
    pub session_token: Arc<Mutex<Option<String>>>,
    pub api_url: Arc<Mutex<String>>,
}

impl Default for TelemetryState {
    fn default() -> Self {
        Self {
            session_token: Arc::new(Mutex::new(None)),
            api_url: Arc::new(Mutex::new("http://localhost:8080".to_string())),
        }
    }
}

#[derive(Serialize)]
struct TelemetryPayload {
    active_window: String,
    running_processes: Vec<String>,
    os_info: String,
    client_type: String,
}

#[tauri::command]
fn exit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[tauri::command]
fn update_telemetry_auth(
    token: String,
    api_url: Option<String>,
    state: tauri::State<'_, TelemetryState>,
) {
    if let Ok(mut lock) = state.session_token.lock() {
        *lock = Some(token);
    }
    if let Some(url) = api_url {
        if let Ok(mut lock) = state.api_url.lock() {
            *lock = url;
        }
    }
}

#[tauri::command]
fn get_client_config(app_handle: tauri::AppHandle) -> Result<Option<AppConfig>, String> {
    let path = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("client.json");
    if path.exists() {
        let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        let cfg: AppConfig = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(Some(cfg))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn set_client_config(
    server_url: String,
    api_url: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, TelemetryState>,
) -> Result<(), String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

    let cfg = AppConfig {
        server_url: server_url.clone(),
        api_url: api_url.clone(),
    };

    let content = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    std::fs::write(config_dir.join("client.json"), content).map_err(|e| e.to_string())?;

    if let Ok(mut lock) = state.api_url.lock() {
        *lock = api_url;
    }

    if let Some(window) = app_handle.get_webview_window("main") {
        let parsed_url: reqwest::Url = server_url.parse().map_err(|e| format!("{}", e))?;
        let _ = window.navigate(parsed_url);
    }

    Ok(())
}

fn collect_running_processes() -> Vec<String> {
    let mut sys = System::new_all();
    sys.refresh_processes();

    let mut process_set = HashSet::new();
    for process in sys.processes().values() {
        let name = process.name().to_string();
        let lower = name.to_lowercase();

        // Skip standard low-level system background daemons
        if lower.starts_with("kworker")
            || lower.starts_with("systemd")
            || lower.contains("launchd")
            || lower.contains("kernel_task")
            || lower.contains("dbus")
            || lower.contains("syslog")
        {
            continue;
        }

        if !name.is_empty() {
            process_set.insert(name);
        }
    }

    let mut list: Vec<String> = process_set.into_iter().collect();
    list.sort();
    list
}

fn spawn_telemetry_loop(state: TelemetryState) {
    let is_telemetry_enabled = std::env::var("ENABLE_TELEMETRY")
        .map(|v| v != "false" && v != "0")
        .unwrap_or(true);

    if !is_telemetry_enabled {
        log::info!("Telemetry disabled via ENABLE_TELEMETRY env var");
        return;
    }

    std::thread::spawn(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap_or_default();

        let os_description = format!("{} {}", std::env::consts::OS, std::env::consts::ARCH);

        loop {
            std::thread::sleep(Duration::from_secs(15));

            let token_option = state.session_token.lock().ok().and_then(|t| t.clone());
            let target_api_url = state
                .api_url
                .lock()
                .ok()
                .map(|u| u.clone())
                .unwrap_or_else(|| "http://localhost:8080".to_string());

            if let Some(token) = token_option {
                let processes = collect_running_processes();
                let payload = TelemetryPayload {
                    active_window: "MiniAlgothon Desktop Client".to_string(),
                    running_processes: processes,
                    os_info: os_description.clone(),
                    client_type: "DESKTOP".to_string(),
                };

                let request_url = format!("{}/api/v1/telemetry/ping", target_api_url.trim_end_matches('/'));
                let response = client
                    .post(&request_url)
                    .header("Authorization", format!("Bearer {}", token))
                    .json(&payload)
                    .send();

                if let Err(err) = response {
                    log::warn!("Telemetry heartbeat failed: {}", err);
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let telemetry_state = TelemetryState::default();

    if let Ok(env_url) = std::env::var("NEXT_PUBLIC_API_URL") {
        if let Ok(mut lock) = telemetry_state.api_url.lock() {
            *lock = env_url;
        }
    }

    spawn_telemetry_loop(telemetry_state.clone());

    tauri::Builder::default()
        .manage(telemetry_state)
        .invoke_handler(tauri::generate_handler![
            update_telemetry_auth,
            exit_app,
            get_client_config,
            set_client_config
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Check for existing client config to navigate automatically
            if let Ok(path) = app.path().app_config_dir().map(|p| p.join("client.json")) {
                if path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(cfg) = serde_json::from_str::<AppConfig>(&content) {
                            if let Some(window) = app.get_webview_window("main") {
                                if let Ok(target) = cfg.server_url.parse::<reqwest::Url>() {
                                    let _ = window.navigate(target);
                                }
                            }
                        }
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
