use std::path::{Path, PathBuf};

const EXTENSION_SIGNATURES: &[&str] = &[
    "github.copilot",
    "github.copilot-chat",
    "continue.continue",
    "supermaven.supermaven",
    "tabnine.tabnine-vscode",
    "codeium.codeium",
    "saoudrizwan.claude-dev",
    "cline.cline",
    "rooveterinaryinc.roo-cline",
    "augment.augment-vscode",
];

/// Scans standard editor directories for installed AI extensions and plugins.
pub fn scan_installed_ai_extensions() -> Vec<String> {
    let mut detected_extensions = Vec::new();
    let search_roots = get_editor_extension_roots();

    for (editor_label, root_dir) in search_roots {
        if !root_dir.is_dir() {
            continue;
        }

        if editor_label.starts_with("jetbrains") {
            scan_jetbrains_dir(&editor_label, &root_dir, &mut detected_extensions);
        } else {
            scan_vscode_style_dir(&editor_label, &root_dir, &mut detected_extensions);
        }
    }

    detected_extensions.sort();
    detected_extensions.dedup();
    detected_extensions
}

fn scan_vscode_style_dir(editor_label: &str, dir: &Path, detected: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }

        let folder_name = entry.file_name().to_string_lossy().to_lowercase();
        for &sig in EXTENSION_SIGNATURES {
            if is_extension_match(&folder_name, sig) {
                detected.push(format!("{}:{}", editor_label, sig));
                break;
            }
        }
    }
}

fn scan_jetbrains_dir(editor_label: &str, dir: &Path, detected: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }

        let folder_name = entry.file_name().to_string_lossy().to_lowercase();
        if folder_name.contains("copilot") {
            detected.push(format!("{}:github.copilot", editor_label));
        } else if folder_name.contains("tabnine") {
            detected.push(format!("{}:tabnine", editor_label));
        } else if folder_name.contains("continue") {
            detected.push(format!("{}:continue", editor_label));
        } else if folder_name.contains("codeium") {
            detected.push(format!("{}:codeium", editor_label));
        }
    }
}

pub fn is_extension_match(folder_name: &str, signature: &str) -> bool {
    let lower_folder = folder_name.to_lowercase();
    let lower_sig = signature.to_lowercase();

    if lower_folder.starts_with(&lower_sig) {
        if lower_folder.len() == lower_sig.len() {
            return true;
        }
        let remainder = &lower_folder[lower_sig.len()..];
        if remainder.starts_with('@') {
            return true;
        }
        if let Some(after_dash) = remainder.strip_prefix('-') {
            if let Some(first_char) = after_dash.chars().next() {
                return first_char.is_ascii_digit()
                    || (first_char == 'v'
                        && after_dash.chars().nth(1).map_or(false, |c| c.is_ascii_digit()));
            }
        }
    }

    false
}

fn get_editor_extension_roots() -> Vec<(&'static str, PathBuf)> {
    let mut roots = Vec::new();

    #[cfg(target_os = "windows")]
    {
        if let Some(user_profile) = std::env::var_os("USERPROFILE").map(PathBuf::from) {
            roots.push(("vscode", user_profile.join(".vscode/extensions")));
            roots.push(("vscode-insiders", user_profile.join(".vscode-insiders/extensions")));
            roots.push(("cursor", user_profile.join(".cursor/extensions")));
            roots.push(("windsurf", user_profile.join(".windsurf/extensions")));
        }
        if let Some(appdata) = std::env::var_os("APPDATA").map(PathBuf::from) {
            let jetbrains_dir = appdata.join("JetBrains");
            if let Ok(entries) = std::fs::read_dir(&jetbrains_dir) {
                for entry in entries.flatten() {
                    let plugins_dir = entry.path().join("plugins");
                    if plugins_dir.is_dir() {
                        roots.push(("jetbrains", plugins_dir));
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
            roots.push(("vscode", home.join(".vscode/extensions")));
            roots.push(("vscode-insiders", home.join(".vscode-insiders/extensions")));
            roots.push(("cursor", home.join(".cursor/extensions")));
            roots.push(("windsurf", home.join(".windsurf/extensions")));

            let jetbrains_dir = home.join("Library/Application Support/JetBrains");
            if let Ok(entries) = std::fs::read_dir(&jetbrains_dir) {
                for entry in entries.flatten() {
                    let plugins_dir = entry.path().join("plugins");
                    if plugins_dir.is_dir() {
                        roots.push(("jetbrains", plugins_dir));
                    }
                }
            }
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
            roots.push(("vscode", home.join(".vscode/extensions")));
            roots.push(("vscode-insiders", home.join(".vscode-insiders/extensions")));
            roots.push(("cursor", home.join(".cursor/extensions")));
            roots.push(("windsurf", home.join(".windsurf/extensions")));

            let jetbrains_dir = home.join(".local/share/JetBrains");
            if let Ok(entries) = std::fs::read_dir(&jetbrains_dir) {
                for entry in entries.flatten() {
                    let plugins_dir = entry.path().join("plugins");
                    if plugins_dir.is_dir() {
                        roots.push(("jetbrains", plugins_dir));
                    }
                }
            }
        }
    }

    roots
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_versioned_extension_folders() {
        assert!(is_extension_match("github.copilot-1.250.0", "github.copilot"));
        assert!(is_extension_match("github.copilot-chat-0.22.2", "github.copilot-chat"));
        assert!(is_extension_match("continue.continue-0.9.1", "continue.continue"));
        assert!(is_extension_match("supermaven.supermaven-0.1.0", "supermaven.supermaven"));
    }

    #[test]
    fn does_not_match_unrelated_prefixes() {
        assert!(!is_extension_match("github.copilot-chat-0.22.2", "github.copilot"));
        assert!(!is_extension_match("github.other-tool-1.0.0", "github.copilot"));
        assert!(!is_extension_match("continue-helper", "continue.continue"));
    }
}
