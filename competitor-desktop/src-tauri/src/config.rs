use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Where the client points. Runtime-configured rather than compiled in, so the
/// contest server can move without reimaging 300 laptops.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClientConfig {
    pub server_url: String,
    pub api_url: String,
}

/// The agent's own credential. Stored at 0600 rather than in an OS keychain: on
/// hundreds of laptops a keychain prompt is a support queue, and this token's only
/// power is reporting telemetry as its own enrollment.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Enrollment {
    pub agent_id: String,
    pub agent_token: String,
    #[serde(default)]
    pub session_token: Option<String>,
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub machine_id: String,
    pub consent_version: String,
}

pub fn config_dir() -> Option<PathBuf> {
    let base = if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"))
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
    };
    base.map(|b| b.join("com.minialgothon.competitor"))
}

fn read_json<T: for<'de> Deserialize<'de>>(name: &str) -> Option<T> {
    let path = config_dir()?.join(name);
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_json<T: Serialize>(name: &str, value: &T, private: bool) -> Result<(), String> {
    let dir = config_dir().ok_or("no config directory available")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(name);
    let content = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    if private {
        restrict_permissions(&path);
    }
    Ok(())
}

#[cfg(unix)]
fn restrict_permissions(path: &PathBuf) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &PathBuf) {
    // Windows inherits the per-user ACL of %APPDATA%, which is already scoped to
    // the enrolled contestant's account.
}

pub fn load_client() -> Option<ClientConfig> {
    read_json("client.json")
}

pub fn save_client(cfg: &ClientConfig) -> Result<(), String> {
    write_json("client.json", cfg, false)
}

pub fn load_enrollment() -> Option<Enrollment> {
    read_json("agent.json")
}

pub fn save_enrollment(enrollment: &Enrollment) -> Result<(), String> {
    write_json("agent.json", enrollment, true)
}

pub fn clear_enrollment() -> Result<(), String> {
    let dir = config_dir().ok_or("no config directory available")?;
    let path = dir.join("agent.json");
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Persists heartbeats the agent could not send.
///
/// Without this the buffer lives only in memory, and the obvious evasion is:
/// unplug, tether, use a local model, kill the agent, plug back in. The gap would
/// remain but everything observed *during* it would be gone. On disk, restarting
/// the agent replays it — so killing the agent delays the evidence instead of
/// destroying it. A contestant with filesystem access can still delete the file;
/// the permanent gap record is what remains in that case.
pub fn save_buffer<T: Serialize>(items: &T) -> Result<(), String> {
    write_json("buffer.json", items, true)
}

pub fn load_buffer<T: for<'de> Deserialize<'de>>() -> Option<T> {
    read_json("buffer.json")
}

pub fn clear_buffer() {
    if let Some(dir) = config_dir() {
        let _ = std::fs::remove_file(dir.join("buffer.json"));
    }
}

/// The portal origin, used to scope the loopback server's CORS allowance.
pub fn portal_origin(server_url: &str) -> String {
    match reqwest::Url::parse(server_url) {
        Ok(url) => match (url.scheme(), url.host_str(), url.port()) {
            (scheme, Some(host), Some(port)) => format!("{scheme}://{host}:{port}"),
            (scheme, Some(host), None) => format!("{scheme}://{host}"),
            _ => String::new(),
        },
        Err(_) => String::new(),
    }
}
