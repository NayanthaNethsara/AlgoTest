use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub const DEFAULT_SERVER_URL: &str = match option_env!("ALGOTHON_SERVER_URL") {
    Some(url) => url,
    None => "https://competitor-portal--algothon-2026.asia-southeast1.hosted.app",
};

pub const DEFAULT_API_URL: &str = match option_env!("ALGOTHON_API_URL") {
    Some(url) => url,
    None => "https://mini-algothon-api.nayantha.me",
};

pub const DEFAULT_PORTAL_ORIGINS: &str = match option_env!("ALGOTHON_PORTAL_ORIGINS") {
    Some(origins) => origins,
    None => "https://competitor-portal--algothon-2026.asia-southeast1.hosted.app,http://localhost:3000",
};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClientConfig {
    pub server_url: String,
    pub api_url: String,
    #[serde(default)]
    pub portal_origins: String,
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            server_url: DEFAULT_SERVER_URL.trim_end_matches('/').to_string(),
            api_url: DEFAULT_API_URL.trim_end_matches('/').to_string(),
            portal_origins: DEFAULT_PORTAL_ORIGINS.to_string(),
        }
    }
}

/// Stored at 0600 rather than in an OS keychain to avoid prompts on contest machines.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Enrollment {
    pub agent_id: String,
    pub agent_token: String,
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub machine_id: String,
    pub consent_version: String,
}

pub const AUTOSTART_NAME: &str = "Algothon Agent";

pub fn config_dir() -> Option<PathBuf> {
    let base = if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"))
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
    }?;

    Some(base.join("com.algothon.agent"))
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
fn restrict_permissions(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &std::path::Path) {}

pub fn load_client() -> ClientConfig {
    read_json("client.json").unwrap_or_default()
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

/// Persists unsent heartbeats to disk so restarting the agent replays them.
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

/// Removes all client data and autostart entries from this machine.
pub fn reset() -> Vec<String> {
    let mut removed = Vec::new();

    let base_dirs = if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"))
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
    };

    if let Some(base) = base_dirs {
        for folder in ["com.algothon.agent", "com.algothon.competitor", "com.minialgothon.competitor"] {
            let dir = base.join(folder);
            if dir.exists() {
                for name in ["agent.json", "client.json", "buffer.json", "version.txt"] {
                    let path = dir.join(name);
                    if path.exists() && std::fs::remove_file(&path).is_ok() {
                        removed.push(path.display().to_string());
                    }
                }
                let _ = std::fs::remove_dir(&dir);
            }
        }
    }

    clear_autostart_entry(&mut removed);
    removed
}

pub fn ensure_current_version(current_version: &str) {
    let Some(dir) = config_dir() else { return };
    let version_path = dir.join("version.txt");

    let stored_version = std::fs::read_to_string(&version_path)
        .ok()
        .map(|s| s.trim().to_string());

    if stored_version.as_deref() != Some(current_version) {
        log::info!(
            "version change detected (stored: {:?}, current: {}), resetting stale client data",
            stored_version,
            current_version
        );
        let _ = reset();
        write_version_marker(&dir, current_version);
    }
}

fn write_version_marker(dir: &std::path::Path, current_version: &str) {
    if std::fs::create_dir_all(dir).is_ok() {
        let _ = std::fs::write(dir.join("version.txt"), current_version.trim());
    }
}

pub fn clear_autostart() {
    let mut removed = Vec::new();
    clear_autostart_entry(&mut removed);
}

const KNOWN_AUTOSTART_NAMES: &[&str] = &[
    "Algothon Agent",
    "algothon-agent",
    "algothon-competitor",
    "MiniAlgothon Agent",
    "mini-algothon-competitor",
];

#[cfg(target_os = "macos")]
fn clear_autostart_entry(removed: &mut Vec<String>) {
    if let Some(home) = std::env::var_os("HOME") {
        for name in KNOWN_AUTOSTART_NAMES {
            let path = PathBuf::from(&home)
                .join("Library/LaunchAgents")
                .join(format!("{name}.plist"));
            remove_autostart_file(&path, removed);
        }
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn clear_autostart_entry(removed: &mut Vec<String>) {
    if let Some(home) = std::env::var_os("HOME") {
        for name in KNOWN_AUTOSTART_NAMES {
            let path = PathBuf::from(&home)
                .join(".config/autostart")
                .join(format!("{name}.desktop"));
            remove_autostart_file(&path, removed);
        }
    }
}

#[cfg(unix)]
fn remove_autostart_file(path: &std::path::Path, removed: &mut Vec<String>) {
    if path.exists() && std::fs::remove_file(path).is_ok() {
        removed.push(path.display().to_string());
    }
}

#[cfg(target_os = "windows")]
fn clear_autostart_entry(removed: &mut Vec<String>) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const RUN_KEY: &str = r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
    for name in KNOWN_AUTOSTART_NAMES {
        let deleted = std::process::Command::new("reg")
            .args(["delete", RUN_KEY, "/v", name, "/f"])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
        if deleted {
            removed.push(format!("{RUN_KEY}\\{name}"));
        }
    }
}


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

pub fn allowed_portal_origins(server_url: &str, extra_origins: &str) -> String {
    let mut origins = Vec::new();

    let primary = portal_origin(server_url);
    if !primary.is_empty() {
        origins.push(primary);
    }
    for extra in extra_origins.split(',') {
        let origin = portal_origin(extra.trim());
        if !origin.is_empty() && !origins.contains(&origin) {
            origins.push(origin);
        }
    }

    origins.join(",")
}

/// Compares on resolved host/port so `localhost` and `127.0.0.1` are equivalent.
pub fn origin_matches(allowed_origins: &str, candidate: &str) -> bool {
    let candidate = normalize_origin(candidate);
    if candidate.is_empty() {
        return false;
    }
    allowed_origins
        .split(',')
        .map(str::trim)
        .filter(|allowed| !allowed.is_empty())
        .any(|allowed| normalize_origin(allowed) == candidate)
}

fn normalize_origin(origin: &str) -> String {
    let Ok(url) = reqwest::Url::parse(origin) else {
        return origin.trim().trim_end_matches('/').to_lowercase();
    };

    let host = match url.host_str() {
        Some("localhost") | Some("127.0.0.1") | Some("::1") | Some("[::1]") => "localhost",
        Some(host) => host,
        None => "",
    };

    match url.port_or_known_default() {
        Some(port) => format!("{}://{host}:{port}", url.scheme()),
        None => format!("{}://{host}", url.scheme()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_the_configured_portal() {
        assert!(origin_matches("http://contest.local", "http://contest.local"));
        assert!(origin_matches("http://contest.local:3000", "http://contest.local:3000"));
    }

    #[test]
    fn accepts_either_spelling_of_the_local_host() {
        assert!(origin_matches("http://localhost:3000", "http://127.0.0.1:3000"));
        assert!(origin_matches("http://127.0.0.1:3000", "http://localhost:3000"));
    }

    #[test]
    fn treats_a_default_port_as_the_same_origin() {
        assert!(origin_matches("http://contest.local", "http://contest.local:80"));
        assert!(origin_matches("https://contest.local:443", "https://contest.local"));
    }

    #[test]
    fn refuses_a_different_host_port_or_scheme() {
        assert!(!origin_matches("http://localhost:3000", "http://localhost:3001"));
        assert!(!origin_matches("http://localhost:3000", "http://evil.example:3000"));
        assert!(!origin_matches("http://contest.local", "https://contest.local"));
    }

    #[test]
    fn refuses_everything_when_no_portal_is_configured() {
        assert!(!origin_matches("", "http://localhost:3000"));
        assert!(!origin_matches("", ""));
        assert!(!origin_matches("http://contest.local", ""));
    }

    #[test]
    fn accepts_any_configured_portal() {
        let allowed = "http://contest.local,https://algothon.vercel.app";
        assert!(origin_matches(allowed, "http://contest.local"));
        assert!(origin_matches(allowed, "https://algothon.vercel.app"));
        assert!(!origin_matches(allowed, "https://evil.example"));
    }

    #[test]
    fn tolerates_blank_entries_in_the_origin_list() {
        assert!(origin_matches("http://contest.local, ,", "http://contest.local"));
        assert!(!origin_matches(" , ", "http://contest.local"));
    }

    #[test]
    fn collects_the_primary_portal_and_its_standbys() {
        let origins = allowed_portal_origins(
            "http://contest.local/login",
            "https://algothon.vercel.app, http://contest.local",
        );
        assert_eq!(origins, "http://contest.local,https://algothon.vercel.app");
    }

    #[test]
    fn collects_nothing_from_unparseable_addresses() {
        assert_eq!(allowed_portal_origins("", ""), "");
        assert_eq!(allowed_portal_origins("not a url", "also not"), "");
    }

    #[test]
    fn defaults_are_usable_urls() {
        let config = ClientConfig::default();
        assert!(reqwest::Url::parse(&config.server_url).is_ok());
        assert!(reqwest::Url::parse(&config.api_url).is_ok());
        assert!(!portal_origin(&config.server_url).is_empty());
    }

    #[test]
    fn writes_version_marker() {
        let dir =
            std::env::temp_dir().join(format!("algothon-version-test-{}", uuid::Uuid::new_v4()));
        write_version_marker(&dir, "0.99.99");
        let version_file = dir.join("version.txt");
        assert!(version_file.exists());
        let read_back = std::fs::read_to_string(&version_file).unwrap();
        assert_eq!(read_back.trim(), "0.99.99");
        std::fs::remove_file(version_file).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
}
