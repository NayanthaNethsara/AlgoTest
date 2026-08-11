use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Where a client points when nobody has told it otherwise.
///
/// Baked in at build time — `MINIALGOTHON_SERVER_URL=… cargo tauri build` — so a
/// contestant never types a URL. Asking them to was the single worst failure mode
/// in this client: the portal address they enter becomes the only Origin the
/// loopback server will answer, so one character wrong, or `localhost` where they
/// then browse `127.0.0.1`, silently cost them attestation and showed a banner
/// blaming an agent that was running perfectly.
///
/// A saved `client.json` still wins, so the contest server can move without
/// rebuilding — it is just no longer something anyone has to supply by hand.
pub const DEFAULT_SERVER_URL: &str = match option_env!("MINIALGOTHON_SERVER_URL") {
    Some(url) => url,
    None => "http://localhost:3000",
};

pub const DEFAULT_API_URL: &str = match option_env!("MINIALGOTHON_API_URL") {
    Some(url) => url,
    None => "http://localhost:8080",
};

/// Where the client points.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClientConfig {
    pub server_url: String,
    pub api_url: String,
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            server_url: DEFAULT_SERVER_URL.trim_end_matches('/').to_string(),
            api_url: DEFAULT_API_URL.trim_end_matches('/').to_string(),
        }
    }
}

/// The agent's own credential. Stored at 0600 rather than in an OS keychain: on
/// hundreds of laptops a keychain prompt is a support queue, and this token's only
/// power is reporting telemetry as its own enrollment.
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

/// The name `tauri-plugin-autostart` registers under — `package_info().name`,
/// which is the `productName` in tauri.conf.json. Repeated here because `--reset`
/// has to remove the login item without a running Tauri app to ask.
pub const AUTOSTART_NAME: &str = "mini-algothon-competitor";

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

/// The client's target: whatever an organizer saved, otherwise the compiled-in
/// default. Never `None`, so no code path has to cope with an unconfigured client.
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

/// Removes every trace this client leaves on a machine: the server address, the
/// enrollment, the buffered heartbeats, and the login item.
///
/// This exists because a proctor agent is deliberately hard to get rid of — it
/// autostarts, it relaunches itself, and it keeps its state outside the checkout.
/// That is right for a contest hall and wrong for a laptop running `make desktop`
/// twenty times a day, so the escape hatch is explicit rather than folklore about
/// which files to `rm`.
///
/// Returns what it actually removed, so the caller can say so rather than claim a
/// clean slate it did not verify.
pub fn reset() -> Vec<String> {
    let mut removed = Vec::new();

    if let Some(dir) = config_dir() {
        for name in ["agent.json", "client.json", "buffer.json"] {
            let path = dir.join(name);
            if path.exists() && std::fs::remove_file(&path).is_ok() {
                removed.push(path.display().to_string());
            }
        }
        // Only if it is now empty: a directory this one shares with anything else
        // is not ours to delete.
        let _ = std::fs::remove_dir(&dir);
    }

    clear_autostart_entry(&mut removed);
    removed
}

#[cfg(target_os = "macos")]
fn clear_autostart_entry(removed: &mut Vec<String>) {
    remove_autostart_file(
        std::env::var_os("HOME").map(|home| {
            PathBuf::from(home)
                .join("Library/LaunchAgents")
                .join(format!("{AUTOSTART_NAME}.plist"))
        }),
        removed,
    );
}

#[cfg(all(unix, not(target_os = "macos")))]
fn clear_autostart_entry(removed: &mut Vec<String>) {
    remove_autostart_file(
        std::env::var_os("HOME").map(|home| {
            PathBuf::from(home)
                .join(".config/autostart")
                .join(format!("{AUTOSTART_NAME}.desktop"))
        }),
        removed,
    );
}

#[cfg(unix)]
fn remove_autostart_file(path: Option<PathBuf>, removed: &mut Vec<String>) {
    if let Some(path) = path {
        if path.exists() && std::fs::remove_file(&path).is_ok() {
            removed.push(path.display().to_string());
        }
    }
}

#[cfg(target_os = "windows")]
fn clear_autostart_entry(removed: &mut Vec<String>) {
    const RUN_KEY: &str = r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
    let deleted = std::process::Command::new("reg")
        .args(["delete", RUN_KEY, "/v", AUTOSTART_NAME, "/f"])
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    if deleted {
        removed.push(format!("{RUN_KEY}\\{AUTOSTART_NAME}"));
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

/// Whether a request's `Origin` is the configured portal.
///
/// Compared on the resolved host and port rather than by string equality, because
/// `localhost` and `127.0.0.1` name the same machine and `http://host` and
/// `http://host:80` are the same origin. A contestant who reaches the portal by one
/// spelling while the client holds the other is doing nothing suspicious, and the
/// cost of refusing them is invisible: no nonce, so no attestation, so a banner
/// telling them their proctor client is not running when it is.
pub fn origin_matches(allowed_origin: &str, candidate: &str) -> bool {
    !allowed_origin.is_empty() && normalize_origin(allowed_origin) == normalize_origin(candidate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_the_configured_portal() {
        assert!(origin_matches("http://contest.local", "http://contest.local"));
        assert!(origin_matches("http://contest.local:3000", "http://contest.local:3000"));
    }

    /// The bug this function exists for: the two spellings of "this machine" are
    /// one origin, and treating them as different silently cost attestation.
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

    /// An unconfigured client grants nothing rather than everything.
    #[test]
    fn refuses_everything_when_no_portal_is_configured() {
        assert!(!origin_matches("", "http://localhost:3000"));
        assert!(!origin_matches("", ""));
    }

    #[test]
    fn defaults_are_usable_urls() {
        let config = ClientConfig::default();
        assert!(reqwest::Url::parse(&config.server_url).is_ok());
        assert!(reqwest::Url::parse(&config.api_url).is_ok());
        assert!(!portal_origin(&config.server_url).is_empty());
    }
}

fn normalize_origin(origin: &str) -> String {
    let Ok(url) = reqwest::Url::parse(origin) else {
        return origin.trim().trim_end_matches('/').to_lowercase();
    };

    let host = match url.host_str() {
        // Every spelling of "this machine" is one host.
        Some("localhost") | Some("127.0.0.1") | Some("::1") | Some("[::1]") => "localhost",
        Some(host) => host,
        None => "",
    };

    match url.port_or_known_default() {
        Some(port) => format!("{}://{host}:{port}", url.scheme()),
        None => format!("{}://{host}", url.scheme()),
    }
}
