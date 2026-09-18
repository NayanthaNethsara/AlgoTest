pub mod agent;
pub mod config;
pub mod shell;
pub mod signals;

pub const AGENT_VERSION: &str = env!("CARGO_PKG_VERSION");

pub const LOOPBACK_IP: std::net::Ipv4Addr = std::net::Ipv4Addr::LOCALHOST;

pub fn loopback_url(port: u16, path: &str) -> String {
    format!("http://{LOOPBACK_IP}:{port}{path}")
}

pub const LOOPBACK_PORTS: [u16; 5] = [47615, 47616, 47617, 47618, 47619];

pub const SHELL_PORT: u16 = 47620;

pub fn context() -> tauri::Context {
    tauri::generate_context!()
}
