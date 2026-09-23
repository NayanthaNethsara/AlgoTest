#[cfg(target_os = "windows")]
pub struct InstanceLock {
    handle: windows_sys::Win32::Foundation::HANDLE,
}

#[cfg(target_os = "windows")]
impl Drop for InstanceLock {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            unsafe {
                windows_sys::Win32::Foundation::CloseHandle(self.handle);
            }
        }
    }
}

#[cfg(target_os = "windows")]
pub fn acquire_process_lock(name: &str) -> Option<InstanceLock> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::System::Threading::CreateMutexW;

    let wide_name: Vec<u16> = OsStr::new(name)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        let handle = CreateMutexW(std::ptr::null(), 1, wide_name.as_ptr());
        if handle.is_null() || GetLastError() == ERROR_ALREADY_EXISTS {
            if !handle.is_null() {
                windows_sys::Win32::Foundation::CloseHandle(handle);
            }
            return None;
        }
        Some(InstanceLock { handle })
    }
}

#[cfg(not(target_os = "windows"))]
pub struct InstanceLock {
    _file: std::fs::File,
}

#[cfg(not(target_os = "windows"))]
pub fn acquire_process_lock(_name: &str) -> Option<InstanceLock> {
    use std::os::fd::AsRawFd;
    let dir = crate::config::config_dir()?;
    std::fs::create_dir_all(&dir).ok()?;
    let file = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(dir.join("instance.lock"))
        .ok()?;
    if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
        return None;
    }
    Some(InstanceLock { _file: file })
}
