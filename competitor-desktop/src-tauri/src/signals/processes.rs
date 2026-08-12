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

        for (i, term) in terms.iter().enumerate() {
            if matches_term(&name_tokens, term) || matches_term(&cmd_tokens, term) {
                let label = &denylist[i];
                if !matches.contains(label) {
                    matches.push(label.clone());
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenizes_alphanumeric_parts_and_lowercases() {
        assert_eq!(tokenize("LM Studio 0.2.1"), vec!["lm", "studio", "0", "2", "1"]);
        assert_eq!(tokenize("/usr/bin/python3.10"), vec!["usr", "bin", "python3", "10"]);
        assert_eq!(tokenize(""), Vec::<String>::new());
    }

    #[test]
    fn matches_term_sequences() {
        let candidate = vec!["python3".to_string(), "m".to_string(), "vllm".to_string(), "entrypoint".to_string()];
        assert!(matches_term(&candidate, &["vllm".to_string()]));
        assert!(matches_term(&candidate, &["m".to_string(), "vllm".to_string()]));
        assert!(!matches_term(&candidate, &["ollama".to_string()]));
        assert!(!matches_term(&candidate, &["vllm".to_string(), "python3".to_string()]));
    }

    #[test]
    fn empty_terms_do_not_match() {
        let candidate = vec!["ollama".to_string()];
        assert!(!matches_term(&candidate, &[]));
    }
}
