pub mod dwell;
pub mod extensions;
pub mod foreground;
pub mod network;
pub mod ports;
pub mod processes;

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub use dwell::DwellTracker;
pub use extensions::scan_installed_ai_extensions;
pub use foreground::{get_foreground_app, ForegroundInfo};
pub use network::{lan_ip, ReachabilityProbe};
pub use ports::{probe_localhost_ports, PortMatch};
pub use processes::{collect_matched_processes, ProcessMatchReport};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct SignalReport {
    pub foreground_dwell: HashMap<String, u64>,
    pub foreground_app: String,
    pub ports: Vec<PortMatch>,
    pub internet_reachable: bool,
    pub process_matches: Vec<String>,
    pub total_processes: usize,
    pub lan_ip: String,
    pub extension_matches: Vec<String>,
}

impl SignalReport {
    /// Hashes only the *stateful* signals.
    ///
    /// Dwell and process counts change on every single heartbeat, so including
    /// them would make every heartbeat look like a state change and defeat the
    /// server's short-circuit — which is the thing that keeps 500 agents cheap.
    pub fn signal_hash(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(if self.internet_reachable { b"net:1" } else { b"net:0" });

        let mut confirmed: Vec<String> = self
            .ports
            .iter()
            .filter(|p| p.confirmed)
            .map(|p| format!("{}:{}", p.rule_id, p.port))
            .collect();
        confirmed.sort();
        for entry in confirmed {
            hasher.update(b"|port:");
            hasher.update(entry.as_bytes());
        }

        let mut processes = self.process_matches.clone();
        processes.sort();
        for entry in processes {
            hasher.update(b"|proc:");
            hasher.update(entry.as_bytes());
        }

        let mut extensions = self.extension_matches.clone();
        extensions.sort();
        for entry in extensions {
            hasher.update(b"|ext:");
            hasher.update(entry.as_bytes());
        }

        let mut apps: Vec<&String> = self.foreground_dwell.keys().collect();
        apps.sort();
        for app in apps {
            hasher.update(b"|fg:");
            hasher.update(app.as_bytes());
        }

        hex::encode(hasher.finalize())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn report() -> SignalReport {
        SignalReport {
            internet_reachable: false,
            process_matches: vec!["ollama".into()],
            extension_matches: vec!["vscode:github.copilot".into()],
            ports: vec![PortMatch {
                port: 11434,
                rule_id: "ai.port.ollama".into(),
                product: "Ollama".into(),
                confirmed: true,
            }],
            ..Default::default()
        }
    }

    #[test]
    fn dwell_and_counts_do_not_change_the_hash() {
        let mut a = report();
        let mut b = report();
        a.total_processes = 400;
        b.total_processes = 512;
        a.foreground_dwell.insert("editor".into(), 5_000);
        b.foreground_dwell.insert("editor".into(), 9_000);

        assert_eq!(a.signal_hash(), b.signal_hash());
    }

    #[test]
    fn a_real_state_change_changes_the_hash() {
        let baseline = report();

        let mut reachable = report();
        reachable.internet_reachable = true;
        assert_ne!(baseline.signal_hash(), reachable.signal_hash());

        let mut unconfirmed = report();
        unconfirmed.ports[0].confirmed = false;
        assert_ne!(baseline.signal_hash(), unconfirmed.signal_hash());

        let mut new_ext = report();
        new_ext.extension_matches = vec!["vscode:continue".into()];
        assert_ne!(baseline.signal_hash(), new_ext.signal_hash());

        let mut new_app = report();
        new_app.foreground_dwell.insert("ai.ollama.app".into(), 1);
        assert_ne!(baseline.signal_hash(), new_app.signal_hash());
    }

    #[test]
    fn ordering_does_not_change_the_hash() {
        let mut a = report();
        let mut b = report();
        a.process_matches = vec!["ollama".into(), "vllm".into()];
        b.process_matches = vec!["vllm".into(), "ollama".into()];
        a.extension_matches = vec!["vscode:github.copilot".into(), "vscode:continue".into()];
        b.extension_matches = vec!["vscode:continue".into(), "vscode:github.copilot".into()];

        assert_eq!(a.signal_hash(), b.signal_hash());
    }
}
