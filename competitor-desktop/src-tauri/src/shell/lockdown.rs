use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

use crate::shell::{MAIN_WINDOW, QUITTING};

pub fn enable_platform_lockdown(_window: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    macos::enable();

    #[cfg(target_os = "windows")]
    windows::enable(_window);
}

pub fn restore_platform_lockdown() {
    #[cfg(target_os = "macos")]
    macos::restore();

    #[cfg(target_os = "windows")]
    windows::restore();
}

pub fn force_foreground_focus(window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_always_on_top(true);
    let _ = window.set_focus();

    #[cfg(target_os = "macos")]
    macos::activate_foreground();

    #[cfg(target_os = "windows")]
    windows::activate_foreground(window);
}

pub fn prompt_native_exit(app: &AppHandle) {
    let app_handle = app.clone();
    let window_opt = app.get_webview_window(MAIN_WINDOW);

    if let Some(ref window) = window_opt {
        let _ = window.set_always_on_top(false);
    }

    let mut dialog = app.dialog()
        .message("Are you sure you want to leave the competition and exit the application?\n\nExiting will lock your competition account until an administrator grants re-entry.")
        .title("Exit Competition Lockdown?");

    if let Some(ref window) = window_opt {
        dialog = dialog.parent(window);
    }

    dialog
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Exit Competition".to_string(),
            "Cancel & Stay".to_string(),
        ))
        .show(move |confirmed| {
            if confirmed {
                // Signal local proctor agent of voluntary exit
                for port in crate::LOOPBACK_PORTS {
                    let _ = reqwest::blocking::Client::builder()
                        .timeout(std::time::Duration::from_millis(300))
                        .build()
                        .ok()
                        .and_then(|client| client.post(crate::loopback_url(port, "/stop")).send().ok());
                }

                restore_platform_lockdown();
                QUITTING.store(true, Ordering::Relaxed);
                if let Some(window) = app_handle.get_webview_window(MAIN_WINDOW) {
                    let _ = window.set_always_on_top(false);
                    let _ = window.set_fullscreen(false);
                }
                app_handle.exit(0);
            } else {
                if let Some(window) = app_handle.get_webview_window(MAIN_WINDOW) {
                    let _ = window.set_always_on_top(true);
                    let _ = window.set_fullscreen(true);
                    let _ = window.set_focus();
                    enable_platform_lockdown(&window);
                }
            }
        });
}

#[cfg(target_os = "macos")]
mod macos {
    use objc2_app_kit::{NSApplication, NSApplicationPresentationOptions};
    use objc2_foundation::MainThreadMarker;

    pub fn enable() {
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

    pub fn restore() {
        if let Some(mtm) = MainThreadMarker::new() {
            let app = NSApplication::sharedApplication(mtm);
            app.setPresentationOptions(NSApplicationPresentationOptions::Default);
        }
    }

    pub fn activate_foreground() {
        if let Some(mtm) = MainThreadMarker::new() {
            let app = NSApplication::sharedApplication(mtm);
            #[allow(deprecated)]
            app.activateIgnoringOtherApps(true);
        }
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use std::sync::atomic::{AtomicPtr, Ordering};
    use tauri::WebviewWindow;
    use windows_sys::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, SetWindowPos, SetWindowsHookExW, UnhookWindowsHookEx,
        HHOOK, HWND_TOPMOST, KBDLLHOOKSTRUCT, LLKHF_ALTDOWN, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW,
        WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    const VK_TAB: u16 = 0x09;
    const VK_SHIFT: i32 = 0x10;
    const VK_CONTROL: i32 = 0x11;
    const VK_MENU: i32 = 0x12; // Alt key
    const VK_ESCAPE: u16 = 0x1B;
    const VK_SPACE: u16 = 0x20;
    const VK_SNAPSHOT: u16 = 0x2C; // PrintScreen
    const VK_LWIN: u16 = 0x5B;
    const VK_RWIN: u16 = 0x5C;
    const VK_F4: u16 = 0x73;

    static HOOK_HANDLE: AtomicPtr<std::ffi::c_void> = AtomicPtr::new(std::ptr::null_mut());

    unsafe extern "system" fn low_level_keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            let msg = wparam as u32;
            if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN || msg == WM_KEYUP || msg == WM_SYSKEYUP {
                let kbd = *(lparam as *const KBDLLHOOKSTRUCT);
                let vk = kbd.vkCode as u16;
                let is_alt_down = (kbd.flags & LLKHF_ALTDOWN) != 0;

                // Native Hardware Emergency Exit Shortcut: Ctrl+Shift+Q or Alt+Shift+Q or Ctrl+Shift+Escape
                let is_ctrl = (GetAsyncKeyState(VK_CONTROL as i32) as u16 & 0x8000) != 0;
                let is_shift = (GetAsyncKeyState(VK_SHIFT as i32) as u16 & 0x8000) != 0;
                let is_alt = (GetAsyncKeyState(VK_MENU as i32) as u16 & 0x8000) != 0;

                if (vk == 0x51 /* 'Q' */ || vk == VK_ESCAPE) && (is_ctrl || is_alt) && is_shift {
                    std::thread::spawn(|| {
                        let _ = reqwest::blocking::Client::new()
                            .post(format!("http://127.0.0.1:{}/request-exit", crate::SHELL_PORT))
                            .send();
                    });
                    return 1;
                }

                // Block Windows Keys (Start menu, Win+Tab, Win+Ctrl+Left/Right, Win+D, Win+M)
                if vk == VK_LWIN || vk == VK_RWIN {
                    return 1;
                }

                // Block Alt+Tab, Alt+Esc, Alt+F4, Alt+Space
                if is_alt_down && (vk == VK_TAB || vk == VK_ESCAPE || vk == VK_F4 || vk == VK_SPACE) {
                    return 1;
                }

                // Block Ctrl+Esc
                if vk == VK_ESCAPE && is_ctrl {
                    return 1;
                }

                // Block PrintScreen
                if vk == VK_SNAPSHOT {
                    return 1;
                }
            }
        }
        CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
    }

    pub fn enable(window: &WebviewWindow) {
        unsafe {
            if let Ok(hwnd) = window.hwnd() {
                let raw_hwnd = hwnd.0 as HWND;
                SetWindowPos(
                    raw_hwnd,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
                );
            }

            let hook = SetWindowsHookExW(
                WH_KEYBOARD_LL,
                Some(low_level_keyboard_proc),
                std::ptr::null_mut() as HINSTANCE,
                0,
            );
            if !hook.is_null() {
                HOOK_HANDLE.store(hook as *mut std::ffi::c_void, Ordering::SeqCst);
            }
        }
    }

    pub fn restore() {
        let hook = HOOK_HANDLE.swap(std::ptr::null_mut(), Ordering::SeqCst);
        if !hook.is_null() {
            unsafe {
                UnhookWindowsHookEx(hook as HHOOK);
            }
        }
    }

    pub fn activate_foreground(window: &WebviewWindow) {
        if let Ok(hwnd) = window.hwnd() {
            let raw_hwnd = hwnd.0 as HWND;
            unsafe {
                use windows_sys::Win32::UI::WindowsAndMessaging::{
                    BringWindowToTop, SetForegroundWindow, SetWindowPos, HWND_TOPMOST, SWP_NOMOVE,
                    SWP_NOSIZE, SWP_SHOWWINDOW,
                };
                SetWindowPos(
                    raw_hwnd,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
                );
                SetForegroundWindow(raw_hwnd);
                BringWindowToTop(raw_hwnd);
            }
        }
    }
}
