use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

const PROBE_TARGETS: [&str; 2] = ["1.1.1.1:53", "8.8.8.8:53"];
const PROBE_TIMEOUT: Duration = Duration::from_millis(300);

/// Requires two consecutive positive probes before reporting reachability.
///
/// On a true air gap a single success is dispositive, which is exactly why one
/// spurious result must not mint a weight-50 finding against a contestant.
pub struct ReachabilityProbe {
    consecutive_hits: u8,
    reachable: bool,
}

impl ReachabilityProbe {
    pub fn new() -> Self {
        Self { consecutive_hits: 0, reachable: false }
    }

    pub fn probe(&mut self) -> bool {
        let hit = PROBE_TARGETS.iter().any(|target| reachable(target));
        if hit {
            self.consecutive_hits = self.consecutive_hits.saturating_add(1);
        } else {
            self.consecutive_hits = 0;
        }
        self.reachable = self.consecutive_hits >= 2;
        self.reachable
    }

    pub fn reachable(&self) -> bool {
        self.reachable
    }
}

impl Default for ReachabilityProbe {
    fn default() -> Self {
        Self::new()
    }
}

fn reachable(target: &str) -> bool {
    match target.parse::<SocketAddr>() {
        Ok(addr) => TcpStream::connect_timeout(&addr, PROBE_TIMEOUT).is_ok(),
        Err(_) => false,
    }
}

/// The machine's LAN address, used to spot a submission arriving from a different
/// machine than the one the agent is watching.
pub fn lan_ip() -> String {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_default()
}
