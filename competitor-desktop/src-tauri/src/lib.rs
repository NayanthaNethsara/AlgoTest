use std::collections::HashSet;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use serde::Serialize;
use sysinfo::System;
use tauri::Manager;

struct NodeServer(Mutex<Option<Child>>);

impl Drop for NodeServer {
    fn drop(&mut self) {
        if let Some(mut child) = self.0.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
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

fn find_server_dir(app: &tauri::App) -> Option<std::path::PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        let exe_dir = exe.parent()?;
        let server_dir = exe_dir.join("server").join("competitor-frontend");
        if server_dir.join("server.js").exists() {
            return Some(server_dir);
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let server_dir = resource_dir.join("server").join("competitor-frontend");
        if server_dir.join("server.js").exists() {
            return Some(server_dir);
        }
    }

    None
}

fn find_node_binary(server_dir: &std::path::Path) -> std::path::PathBuf {
    let node_name = if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    };

    let bundled_node = server_dir.join("bin").join(node_name);
    if bundled_node.exists() {
        return bundled_node;
    }

    if let Some(parent) = server_dir.parent() {
        let parent_node = parent.join("bin").join(node_name);
        if parent_node.exists() {
            return parent_node;
        }
    }

    std::path::PathBuf::from("node")
}

fn spawn_next_server(app: &tauri::App) -> Option<Child> {
    let server_dir = find_server_dir(app)?;
    let server_js = server_dir.join("server.js");
    let node_bin = find_node_binary(&server_dir);

    log::info!("Starting Next.js server with {:?} from {:?}", node_bin, server_js);

    let child = Command::new(&node_bin)
        .arg(&server_js)
        .current_dir(&server_dir)
        .env("PORT", "3000")
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .env(
            "NEXT_PUBLIC_API_URL",
            std::env::var("NEXT_PUBLIC_API_URL")
                .unwrap_or_else(|_| "http://localhost:8080".to_string()),
        )
        .spawn()
        .map_err(|e| log::error!("Failed to start Node server: {}", e))
        .ok()?;

    std::thread::sleep(Duration::from_millis(2000));
    Some(child)
}

fn collect_running_processes() -> Vec<String> {
    let mut sys = System::new_all();
    sys.refresh_processes();

    let mut process_set = HashSet::new();
    for process in sys.processes().values() {
        let name = process.name().to_string();
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
        .invoke_handler(tauri::generate_handler![update_telemetry_auth])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            if !cfg!(debug_assertions) {
                let child = spawn_next_server(app);
                app.manage(NodeServer(Mutex::new(child)));
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
