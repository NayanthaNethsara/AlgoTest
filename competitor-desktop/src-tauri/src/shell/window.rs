use tauri::{AppHandle, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::shell::scripts::injected_lockdown_script;
use crate::shell::MAIN_WINDOW;

pub fn build_contest_window(app: &AppHandle, target: WebviewUrl) -> Result<WebviewWindow, tauri::Error> {
    #[cfg(target_os = "macos")]
    let os_name = "macos";
    #[cfg(target_os = "windows")]
    let os_name = "windows";
    #[cfg(target_os = "linux")]
    let os_name = "linux";
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    let os_name = "unknown";

    let init_script = injected_lockdown_script(os_name);

    let window = WebviewWindowBuilder::new(app, MAIN_WINDOW, target)
        .title("MiniAlgothon")
        .inner_size(1280.0, 800.0)
        .min_inner_size(620.0, 380.0)
        .fullscreen(true)
        .always_on_top(true)
        .resizable(false)
        .decorations(false)
        .shadow(false)
        .visible_on_all_workspaces(true)
        .initialization_script(&init_script)
        .build()?;

    #[cfg(target_os = "macos")]
    enable_macos_kiosk_lockdown();

    Ok(window)
}

#[cfg(target_os = "macos")]
pub fn enable_macos_kiosk_lockdown() {
    use objc2_app_kit::{NSApplication, NSApplicationPresentationOptions};
    use objc2_foundation::MainThreadMarker;

    if let Some(mtm) = MainThreadMarker::new() {
        let app = NSApplication::sharedApplication(mtm);
        let options = NSApplicationPresentationOptions::HideDock
            | NSApplicationPresentationOptions::HideMenuBar
            | NSApplicationPresentationOptions::DisableProcessSwitching
            | NSApplicationPresentationOptions::DisableForceQuit
            | NSApplicationPresentationOptions::DisableSessionTermination
            | NSApplicationPresentationOptions::DisableHideApplication;
        app.setPresentationOptions(options);
    }
}

#[cfg(target_os = "macos")]
pub fn restore_macos_presentation_options() {
    use objc2_app_kit::{NSApplication, NSApplicationPresentationOptions};
    use objc2_foundation::MainThreadMarker;

    if let Some(mtm) = MainThreadMarker::new() {
        let app = NSApplication::sharedApplication(mtm);
        app.setPresentationOptions(NSApplicationPresentationOptions::Default);
    }
}

#[cfg(not(target_os = "macos"))]
pub fn restore_macos_presentation_options() {}
