pub mod agent;
pub mod config;
pub mod instance;
pub mod signals;

pub use instance::{acquire_process_lock, InstanceLock};

pub const AGENT_VERSION: &str = env!("CARGO_PKG_VERSION");

pub const LOOPBACK_IP: std::net::Ipv4Addr = std::net::Ipv4Addr::LOCALHOST;

pub fn loopback_url(port: u16, path: &str) -> String {
    format!("http://{LOOPBACK_IP}:{port}{path}")
}

pub const LOOPBACK_PORTS: [u16; 5] = [47615, 47616, 47617, 47618, 47619];

pub fn context() -> tauri::Context {
    tauri::generate_context!()
}
