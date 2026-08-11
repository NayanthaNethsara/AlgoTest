pub mod agent;
pub mod config;
pub mod shell;
pub mod signals;

pub const AGENT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// The address every part of this client uses to reach the others.
///
/// Written down once, here, rather than spelled out at each call site — and it
/// stays the loopback address. The attestation proof is precisely "the portal
/// reached the agent on this machine", so an address that could resolve anywhere
/// else would let a contestant relay it from a second laptop, and binding the
/// attestation server to a routable interface would publish the nonce to the hall.
/// The portal holds the same value in `competitor-frontend/src/lib/proctor.ts`;
/// the two have to agree.
pub const LOOPBACK_IP: std::net::Ipv4Addr = std::net::Ipv4Addr::LOCALHOST;

/// Builds a URL against a local port, so no module writes out a scheme and host
/// of its own.
pub fn loopback_url(port: u16, path: &str) -> String {
    format!("http://{LOOPBACK_IP}:{port}{path}")
}

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
