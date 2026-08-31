use serde::{Deserialize, Serialize};
use sysinfo::{ProcessRefreshKind, System};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ProcessMatchReport {
    pub total_count: usize,
    pub matches: Vec<String>,
}

pub fn collect_matched_processes(sys: &mut System, denylist: &[String]) -> ProcessMatchReport {
    sys.refresh_processes_specifics(ProcessRefreshKind::everything());

    let mut matches: Vec<String> = Vec::new();
    let terms: Vec<Vec<String>> = denylist.iter().map(|term| tokenize(term)).collect();

    for process in sys.processes().values() {
        let name = process.name().to_string();
        let name_tokens = tokenize(&name);
        let cmd_tokens = tokenize(&process.cmd().join(" "));
        let exe_str = process
            .exe()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let exe_tokens = tokenize(&exe_str);

        for (i, term) in terms.iter().enumerate() {
            if matches_term(&name_tokens, term)
                || matches_term(&cmd_tokens, term)
                || matches_term(&exe_tokens, term)
            {
                let label = &denylist[i];
                if !matches.contains(label) {
                    matches.push(label.clone());
                }
                break;
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSWorkspace;
        let running = NSWorkspace::sharedWorkspace().runningApplications();
        for app in running {
            let bundle_id = app.bundleIdentifier().map(|id| id.to_string()).unwrap_or_default();
            let bundle_tokens = tokenize(&bundle_id);

            let name = app.localizedName().map(|n| n.to_string()).unwrap_or_default();
            let name_tokens = tokenize(&name);

            let exe_str = app
                .executableURL()
                .and_then(|url| url.path())
                .map(|p| p.to_string())
                .unwrap_or_default();
            let exe_tokens = tokenize(&exe_str);

            for (i, term) in terms.iter().enumerate() {
                if matches_term(&bundle_tokens, term)
                    || matches_term(&name_tokens, term)
                    || matches_term(&exe_tokens, term)
                {
                    let label = &denylist[i];
                    if !matches.contains(label) {
                        matches.push(label.clone());
                    }
                    break;
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStringExt;
        use windows_sys::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM, MAX_PATH};
        use windows_sys::Win32::System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        };
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            EnumWindows, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
            IsWindowVisible,
        };

        struct EnumContext<'a> {
            terms: &'a [Vec<String>],
            denylist: &'a [String],
            matches: &'a mut Vec<String>,
        }

        unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let ctx = &mut *(lparam as *mut EnumContext);

            if IsWindowVisible(hwnd) == 0 {
                return 1;
            }

            let len = GetWindowTextLengthW(hwnd);
            if len > 0 {
                let mut title_buf = vec![0u16; (len + 1) as usize];
                let read_len = GetWindowTextW(hwnd, title_buf.as_mut_ptr(), len + 1);
                if read_len > 0 {
                    let title_os = std::ffi::OsString::from_wide(&title_buf[..read_len as usize]);
                    let title_str = title_os.to_string_lossy().to_string();
                    let title_tokens = tokenize(&title_str);

                    for (i, term) in ctx.terms.iter().enumerate() {
                        if matches_term(&title_tokens, term) {
                            let label = &ctx.denylist[i];
                            if !ctx.matches.contains(label) {
                                ctx.matches.push(label.clone());
                            }
                        }
                    }
                }
            }

            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid > 0 {
                let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
                if !handle.is_null() {
                    let mut buffer = [0u16; MAX_PATH as usize];
                    let mut len = buffer.len() as u32;
                    let ok = QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut len);
                    CloseHandle(handle);

                    if ok != 0 && len > 0 {
                        let path_os = std::ffi::OsString::from_wide(&buffer[..len as usize]);
                        let path_str = path_os.to_string_lossy().to_string();
                        let path_tokens = tokenize(&path_str);

                        for (i, term) in ctx.terms.iter().enumerate() {
                            if matches_term(&path_tokens, term) {
                                let label = &ctx.denylist[i];
                                if !ctx.matches.contains(label) {
                                    ctx.matches.push(label.clone());
                                }
                            }
                        }
                    }
                }
            }

            1
        }

        let mut ctx = EnumContext {
            terms: &terms,
            denylist,
            matches: &mut matches,
        };

        unsafe {
            EnumWindows(Some(enum_windows_proc), &mut ctx as *mut _ as LPARAM);
        }
    }

    let total_count = sys.processes().len();
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
    fn matches_cloud_ai_term_sequences() {
        let copilot_candidate = vec![
            "node".to_string(),
            "dist".to_string(),
            "copilot".to_string(),
            "agent".to_string(),
            "js".to_string(),
        ];
        assert!(matches_term(&copilot_candidate, &["copilot".to_string(), "agent".to_string()]));

        let cursor_candidate = vec!["cursor".to_string(), "app".to_string()];
        assert!(matches_term(&cursor_candidate, &["cursor".to_string()]));

        let antigravity_candidate = vec!["applications".to_string(), "antigravity".to_string(), "ide".to_string(), "app".to_string()];
        assert!(matches_term(&antigravity_candidate, &["antigravity".to_string()]));
    }

    #[test]
    fn empty_terms_do_not_match() {
        let candidate = vec!["ollama".to_string()];
        assert!(!matches_term(&candidate, &[]));
    }
}
