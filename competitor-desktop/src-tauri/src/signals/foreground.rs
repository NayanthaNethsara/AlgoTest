use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ForegroundInfo {
    pub supported: bool,
    pub app_id: String,
}

#[cfg(target_os = "macos")]
pub fn get_foreground_app() -> ForegroundInfo {
    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg("id of application (path to frontmost application as text)")
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let bundle_id = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !bundle_id.is_empty() {
                return ForegroundInfo {
                    supported: true,
                    app_id: bundle_id,
                };
            }
        }
    }

    ForegroundInfo {
        supported: true,
        app_id: "unknown".to_string(),
    }
}

#[cfg(target_os = "windows")]
pub fn get_foreground_app() -> ForegroundInfo {
    let output = std::process::Command::new("powershell")
        .arg("-NoProfile")
        .arg("-Command")
        .arg("$h = [System.Runtime.InteropServices.Marshal]::ReadInt32; Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 -ExpandProperty ProcessName")
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let proc_name = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !proc_name.is_empty() {
                return ForegroundInfo {
                    supported: true,
                    app_id: proc_name,
                };
            }
        }
    }

    ForegroundInfo {
        supported: true,
        app_id: "unknown".to_string(),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn get_foreground_app() -> ForegroundInfo {
    ForegroundInfo {
        supported: false,
        app_id: "".to_string(),
    }
}
