pub mod agent;
pub mod config;
pub mod shell;
pub mod signals;

pub const AGENT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Ports the agent tries in order for its loopback attestation server. The portal
/// probes the same range, so a conflict on the first port costs a retry rather
/// than a broken install.
pub const LOOPBACK_PORTS: [u16; 5] = [47615, 47616, 47617, 47618, 47619];

/// The shell binds this port as its own single-instance mutex and answers /show
/// on it, so the tray can raise an existing window instead of launching a second
/// contest shell over the first one's unsaved work.
pub const SHELL_PORT: u16 = 47620;

/// Built once and shared by both modes: `generate_context!` embeds Info.plist, and
/// expanding it in two places defines that symbol twice.
pub fn context() -> tauri::Context {
    tauri::generate_context!()
}
