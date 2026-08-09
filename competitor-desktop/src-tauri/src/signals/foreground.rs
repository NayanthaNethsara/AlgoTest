use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ForegroundInfo {
    pub supported: bool,
    pub app_id: String,
}

#[cfg(target_os = "macos")]
pub fn get_foreground_app() -> ForegroundInfo {
    use objc2_app_kit::NSWorkspace;

    // NSWorkspace reads the frontmost application without any permission prompt.
    // Screen Recording would be required to read window *titles*, so those are not
    // collected on macOS at all rather than shipping a signal that silently never
    // works.
    let app_id = NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .and_then(|app| app.bundleIdentifier())
        .map(|id| id.to_string());

    ForegroundInfo {
        supported: true,
        app_id: app_id.unwrap_or_else(|| "unknown".to_string()),
    }
}

#[cfg(target_os = "windows")]
pub fn get_foreground_app() -> ForegroundInfo {
    use std::os::windows::ffi::OsStringExt;

    use windows_sys::Win32::Foundation::{CloseHandle, MAX_PATH};
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    unsafe {
        let window = GetForegroundWindow();
        if window.is_null() {
            return ForegroundInfo { supported: true, app_id: "unknown".to_string() };
        }

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(window, &mut pid);
        if pid == 0 {
            return ForegroundInfo { supported: true, app_id: "unknown".to_string() };
        }

        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return ForegroundInfo { supported: true, app_id: "unknown".to_string() };
        }

        let mut buffer = [0u16; MAX_PATH as usize];
        let mut len = buffer.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut len);
        CloseHandle(handle);

        if ok == 0 || len == 0 {
            return ForegroundInfo { supported: true, app_id: "unknown".to_string() };
        }

        let path = std::ffi::OsString::from_wide(&buffer[..len as usize]);
        let app_id = std::path::Path::new(&path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        ForegroundInfo { supported: true, app_id }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn get_foreground_app() -> ForegroundInfo {
    // Wayland has no portable protocol for this. Report it as unsupported so the
    // rule engine treats missing foreground data as an environment fact rather
    // than as evidence — otherwise every default-session Ubuntu user gets flagged.
    ForegroundInfo { supported: false, app_id: String::new() }
}
