use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::time::Duration;

const PROBE_TARGETS: [SocketAddr; 2] = [
    SocketAddr::new(IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1)), 53),
    SocketAddr::new(IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8)), 53),
];
const PROBE_TIMEOUT: Duration = Duration::from_millis(300);

pub struct ReachabilityProbe {
    consecutive_hits: u8,
    is_reachable: bool,
}

impl ReachabilityProbe {
    pub fn new() -> Self {
        Self { consecutive_hits: 0, is_reachable: false }
    }

    pub fn probe(&mut self) -> bool {
        let hit = PROBE_TARGETS.iter().any(is_target_reachable);
        if hit {
            self.consecutive_hits = self.consecutive_hits.saturating_add(1);
        } else {
            self.consecutive_hits = 0;
        }
        self.is_reachable = self.consecutive_hits >= 2;
        self.is_reachable
    }

    pub fn is_reachable(&self) -> bool {
        self.is_reachable
    }
}

impl Default for ReachabilityProbe {
    fn default() -> Self {
        Self::new()
    }
}

fn is_target_reachable(target: &SocketAddr) -> bool {
    TcpStream::connect_timeout(target, PROBE_TIMEOUT).is_ok()
}

pub fn lan_ip() -> String {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reachability_probe_initial_state() {
        let probe = ReachabilityProbe::new();
        assert!(!probe.is_reachable());
    }

    #[test]
    fn probe_targets_are_valid_dns_endpoints() {
        assert_eq!(PROBE_TARGETS.len(), 2);
        assert_eq!(PROBE_TARGETS[0].port(), 53);
        assert_eq!(PROBE_TARGETS[1].port(), 53);
    }
}
