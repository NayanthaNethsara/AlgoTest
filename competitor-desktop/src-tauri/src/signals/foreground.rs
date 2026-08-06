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

#[cfg(not(target_os = "macos"))]
pub fn get_foreground_app() -> ForegroundInfo {
    ForegroundInfo {
        supported: false,
        app_id: "".to_string(),
    }
}
