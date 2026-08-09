use serde::{Deserialize, Serialize};
use sysinfo::System;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ProcessMatchReport {
    pub total_count: usize,
    pub matches: Vec<String>,
}

/// Matches against a server-supplied denylist so organizers can tune detection by
/// editing a table instead of rebuilding 300 binaries.
///
/// Both the process name and the joined command line are checked: `vllm` runs as
/// `python -m vllm.entrypoints...`, whose process name reveals nothing. Only the
/// matches travel to the server — never the full process list.
pub fn collect_matched_processes(sys: &mut System, denylist: &[String]) -> ProcessMatchReport {
    sys.refresh_processes();

    let total_count = sys.processes().len();
    let mut matches: Vec<String> = Vec::new();

    for process in sys.processes().values() {
        let name = process.name().to_string();
        let name_lower = name.to_lowercase();
        let cmdline_lower = process.cmd().join(" ").to_lowercase();

        for term in denylist {
            let term = term.trim().to_lowercase();
            if term.is_empty() {
                continue;
            }
            if name_lower.contains(&term) || cmdline_lower.contains(&term) {
                let label = if name.is_empty() { term.clone() } else { name.clone() };
                if !matches.contains(&label) {
                    matches.push(label);
                }
                break;
            }
        }
    }

    matches.sort();
    ProcessMatchReport { total_count, matches }
}
