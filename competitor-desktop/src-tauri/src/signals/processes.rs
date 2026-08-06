use serde::{Deserialize, Serialize};
use sysinfo::System;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProcessMatchReport {
    pub total_count: usize,
    pub matches: Vec<String>,
}

const DENYLIST_TERMS: &[&str] = &[
    "ollama",
    "lmstudio",
    "jan",
    "gpt4all",
    "llama-server",
    "vllm",
    "koboldcpp",
    "localai",
    "text-generation-webui",
];

pub fn collect_matched_processes(sys: &mut System) -> ProcessMatchReport {
    sys.refresh_processes();
    let mut matches = Vec::new();
    let total_count = sys.processes().len();

    for process in sys.processes().values() {
        let name = process.name().to_string();
        let name_lower = name.to_lowercase();

        let cmdline = process.cmd().join(" ");
        let cmdline_lower = cmdline.to_lowercase();

        for &term in DENYLIST_TERMS {
            if name_lower.contains(term) || cmdline_lower.contains(term) {
                let match_str = if !name.is_empty() {
                    name.clone()
                } else {
                    term.to_string()
                };
                if !matches.contains(&match_str) {
                    matches.push(match_str);
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
