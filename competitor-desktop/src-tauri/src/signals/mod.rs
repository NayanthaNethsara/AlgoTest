pub mod foreground;
pub mod network;
pub mod ports;
pub mod processes;

use serde::{Deserialize, Serialize};
use sysinfo::System;

pub use foreground::{get_foreground_app, ForegroundInfo};
pub use network::check_internet_reachability;
pub use ports::{probe_localhost_ports, PortMatch};
pub use processes::{collect_matched_processes, ProcessMatchReport};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SignalReport {
    pub ports: Vec<PortMatch>,
    pub internet_reachable: bool,
    pub process_matches: Vec<String>,
    pub total_processes: usize,
    pub foreground: ForegroundInfo,
}

pub fn probe_all_signals(sys: &mut System, probe_ports: bool) -> SignalReport {
    let ports = if probe_ports {
        probe_localhost_ports()
    } else {
        Vec::new()
    };

    let internet_reachable = check_internet_reachability();
    let proc_report = collect_matched_processes(sys);
    let foreground = get_foreground_app();

    SignalReport {
        ports,
        internet_reachable,
        process_matches: proc_report.matches,
        total_processes: proc_report.total_count,
        foreground,
    }
}
