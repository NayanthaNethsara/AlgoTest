use sha2::{Digest, Sha256};

/// Salt so the value we transmit is not the raw hardware identifier. It is a
/// stability key for "same machine", not an inventory record.
const MACHINE_ID_SALT: &str = "mini-algothon-proctor-v1";

/// A stable per-machine identifier. Falls back to the hostname, then to a random
/// value, so enrollment still works on a host where the native id is unreadable —
/// re-enrolling such a machine simply looks like a new machine.
pub fn machine_id() -> String {
    let raw = machine_uid::get()
        .ok()
        .filter(|id| !id.trim().is_empty())
        .or_else(hostname)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let mut hasher = Sha256::new();
    hasher.update(MACHINE_ID_SALT.as_bytes());
    hasher.update(raw.trim().as_bytes());
    hex::encode(hasher.finalize())[..32].to_string()
}

fn hostname() -> Option<String> {
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .ok()
        .filter(|h| !h.trim().is_empty())
}

pub fn platform() -> String {
    format!("{} {}", std::env::consts::OS, std::env::consts::ARCH)
}

/// The one string a contestant reads out to the help desk. It resolves them to a
/// row in the admin view without anyone spelling a UUID over a noisy hall.
pub fn support_code(username: &str, machine_id: &str, boot_id: &str) -> String {
    let machine = machine_id.chars().take(6).collect::<String>();
    let boot = boot_id.chars().take(4).collect::<String>();
    format!("{username}-{machine}-{boot}").to_uppercase()
}
