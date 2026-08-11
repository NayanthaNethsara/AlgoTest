use serde::{Deserialize, Serialize};
use sysinfo::System;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ProcessMatchReport {
    pub total_count: usize,
    pub matches: Vec<String>,
}

pub fn collect_matched_processes(sys: &mut System, denylist: &[String]) -> ProcessMatchReport {
    sys.refresh_processes();

    let total_count = sys.processes().len();
    let mut matches: Vec<String> = Vec::new();
    let terms: Vec<Vec<String>> = denylist.iter().map(|term| tokenize(term)).collect();

    for process in sys.processes().values() {
        let name = process.name().to_string();
        let name_tokens = tokenize(&name);
        let cmd_tokens = tokenize(&process.cmd().join(" "));

        for term in &terms {
            if matches_term(&name_tokens, term) || matches_term(&cmd_tokens, term) {
                let label = if name.is_empty() {
                    term.join("-")
                } else {
                    name.clone()
                };
                if !matches.contains(&label) {
                    matches.push(label);
                }
                break;
            }
        }
    }

    matches.sort();
    ProcessMatchReport {
        total_count,
        matches,
    }
}

fn tokenize(value: &str) -> Vec<String> {
    value
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|part| !part.is_empty())
        .map(|part| part.to_ascii_lowercase())
        .collect()
}

fn matches_term(candidate: &[String], term: &[String]) -> bool {
    if term.is_empty() || term.len() > candidate.len() {
        return false;
    }
    candidate
        .windows(term.len())
        .any(|window| window == term)
}
