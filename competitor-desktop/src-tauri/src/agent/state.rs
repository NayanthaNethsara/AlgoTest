use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};

use serde::{Deserialize, Serialize};

use crate::config::{ClientConfig, Enrollment};
use crate::signals::SignalReport;

/// One hour of heartbeats at the default cadence. A server restart or a switch
/// reboot must not be recorded as the contestant's blackout, so the agent keeps
/// its own history and replays it on reconnect.
pub const BUFFER_CAPACITY: usize = 240;

/// How long a heartbeat may go unacknowledged before the tray and the portal
/// report the agent as degraded. Matches the server's ONLINE boundary.
pub const HEALTHY_WINDOW: Duration = Duration::from_secs(45);

/// The shell reports in every 10s; three misses means it is gone.
const SHELL_ALIVE_WINDOW: Duration = Duration::from_secs(30);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Policy {
    pub heartbeat_seconds: u64,
    pub port_probe_seconds: u64,
    pub keepalive_seconds: u64,
    pub rules_refresh_seconds: u64,
    pub gate_max_stale_seconds: u64,
    pub process_denylist: Vec<String>,
    pub foreground_denylist: Vec<String>,
}

impl Default for Policy {
    fn default() -> Self {
        Self {
            heartbeat_seconds: 15,
            port_probe_seconds: 60,
            keepalive_seconds: 300,
            rules_refresh_seconds: 300,
            gate_max_stale_seconds: 90,
            process_denylist: vec![
                "ollama", "lmstudio", "lm studio", "jan", "gpt4all", "llama-server",
                "llama.cpp", "vllm", "koboldcpp", "localai", "text-generation-webui",
            ]
            .into_iter()
            .map(String::from)
            .collect(),
            foreground_denylist: vec!["ai.ollama", "com.ollama", "lmstudio", "ai.jan", "com.gpt4all"]
                .into_iter()
                .map(String::from)
                .collect(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Heartbeat {
    pub boot_id: String,
    pub seq: u64,
    pub mono_ms: u64,
    pub wall_ts: String,
    pub agent_version: String,
    pub loopback_port: u16,
    pub attest_nonce: String,
    pub signal_hash: String,
    pub buffered: bool,
    pub shell_alive: bool,
    pub signals: SignalReport,
}

#[derive(Serialize, Clone, Debug)]
pub struct TickLog {
    pub at: String,
    pub seq: u64,
    pub outcome: String,
    pub detail: String,
}

pub struct AgentState {
    pub boot_id: String,
    pub started_at: Instant,
    pub client: Mutex<Option<ClientConfig>>,
    pub enrollment: Mutex<Option<Enrollment>>,
    pub policy: Mutex<Policy>,
    pub seq: AtomicU64,
    pub loopback_port: AtomicU16,
    /// The nonce currently published over loopback. Rotated only after the server
    /// acknowledges the heartbeat that carried its replacement, so the portal never
    /// reads a value the server has not seen.
    pub published_nonce: Mutex<String>,
    pub shell_last_seen: Mutex<Option<Instant>>,
    pub last_ack: Mutex<Option<Instant>>,
    pub last_ack_wall: Mutex<Option<SystemTime>>,
    pub last_error: Mutex<Option<String>>,
    pub buffer: Mutex<VecDeque<Heartbeat>>,
    pub history: Mutex<VecDeque<TickLog>>,
    pub last_signals: Mutex<SignalReport>,
    pub app: Mutex<Option<tauri::AppHandle>>,
    pub stopping: AtomicBool,
    pub revoked: AtomicBool,
    /// Off for in-memory instances so tests never touch a real config directory.
    persist_buffer: bool,
}

impl AgentState {
    pub fn new() -> Self {
        Self {
            persist_buffer: true,
            boot_id: uuid::Uuid::new_v4().to_string(),
            started_at: Instant::now(),
            client: Mutex::new(crate::config::load_client()),
            enrollment: Mutex::new(crate::config::load_enrollment()),
            policy: Mutex::new(Policy::default()),
            seq: AtomicU64::new(0),
            loopback_port: AtomicU16::new(0),
            published_nonce: Mutex::new(String::new()),
            shell_last_seen: Mutex::new(None),
            last_ack: Mutex::new(None),
            last_ack_wall: Mutex::new(None),
            last_error: Mutex::new(None),
            // A buffer left on disk by a previous run is replayed, so an agent
            // killed while offline still surrenders what it saw.
            buffer: Mutex::new(
                crate::config::load_buffer::<VecDeque<Heartbeat>>()
                    .unwrap_or_else(|| VecDeque::with_capacity(BUFFER_CAPACITY)),
            ),
            history: Mutex::new(VecDeque::with_capacity(20)),
            last_signals: Mutex::new(SignalReport::default()),
            app: Mutex::new(None),
            stopping: AtomicBool::new(false),
            revoked: AtomicBool::new(false),
        }
    }

    /// An instance that keeps its buffer only in memory.
    #[cfg(test)]
    fn ephemeral() -> Self {
        let mut state = Self::new();
        state.persist_buffer = false;
        state.buffer = Mutex::new(VecDeque::with_capacity(BUFFER_CAPACITY));
        state
    }

    pub fn api_url(&self) -> String {
        self.client
            .lock()
            .ok()
            .and_then(|c| c.clone())
            .map(|c| c.api_url.trim_end_matches('/').to_string())
            .unwrap_or_default()
    }

    pub fn server_url(&self) -> String {
        self.client
            .lock()
            .ok()
            .and_then(|c| c.clone())
            .map(|c| c.server_url)
            .unwrap_or_default()
    }

    pub fn token(&self) -> Option<String> {
        self.enrollment.lock().ok()?.as_ref().map(|e| e.agent_token.clone())
    }

    pub fn is_enrolled(&self) -> bool {
        self.enrollment.lock().map(|e| e.is_some()).unwrap_or(false)
    }

    pub fn uptime_seconds(&self) -> u64 {
        self.started_at.elapsed().as_secs()
    }

    pub fn shell_alive(&self) -> bool {
        self.shell_last_seen
            .lock()
            .ok()
            .and_then(|s| *s)
            .map(|seen| seen.elapsed() < SHELL_ALIVE_WINDOW)
            .unwrap_or(false)
    }

    pub fn mark_shell_alive(&self) {
        if let Ok(mut slot) = self.shell_last_seen.lock() {
            *slot = Some(Instant::now());
        }
    }

    pub fn healthy(&self) -> bool {
        self.last_ack
            .lock()
            .ok()
            .and_then(|a| *a)
            .map(|ack| ack.elapsed() < HEALTHY_WINDOW)
            .unwrap_or(false)
    }

    pub fn seconds_since_ack(&self) -> Option<u64> {
        self.last_ack.lock().ok().and_then(|a| *a).map(|ack| ack.elapsed().as_secs())
    }

    pub fn on_ack(&self) {
        if let Ok(mut slot) = self.last_ack.lock() {
            *slot = Some(Instant::now());
        }
        if let Ok(mut slot) = self.last_ack_wall.lock() {
            *slot = Some(SystemTime::now());
        }
        if let Ok(mut slot) = self.last_error.lock() {
            *slot = None;
        }
    }

    pub fn on_error(&self, message: String) {
        if let Ok(mut slot) = self.last_error.lock() {
            *slot = Some(message);
        }
    }

    pub fn publish_nonce(&self, nonce: String) {
        if let Ok(mut slot) = self.published_nonce.lock() {
            *slot = nonce;
        }
    }

    pub fn nonce(&self) -> String {
        self.published_nonce.lock().map(|n| n.clone()).unwrap_or_default()
    }

    pub fn buffer_push(&self, hb: Heartbeat) {
        if let Ok(mut buffer) = self.buffer.lock() {
            if buffer.len() >= BUFFER_CAPACITY {
                buffer.pop_front();
            }
            buffer.push_back(hb);
            if self.persist_buffer {
                persist(&buffer);
            }
        }
    }

    /// Takes the buffer for a flush attempt. The disk copy is kept until the flush
    /// succeeds, so a crash mid-flush does not lose the batch.
    pub fn buffer_take(&self) -> Vec<Heartbeat> {
        self.buffer
            .lock()
            .map(|mut buffer| buffer.drain(..).collect())
            .unwrap_or_default()
    }

    pub fn buffer_clear(&self) {
        if self.persist_buffer {
            crate::config::clear_buffer();
        }
    }

    pub fn buffer_restore(&self, mut items: Vec<Heartbeat>) {
        if let Ok(mut buffer) = self.buffer.lock() {
            while items.len() + buffer.len() > BUFFER_CAPACITY && !items.is_empty() {
                items.remove(0);
            }
            for item in items.into_iter().rev() {
                buffer.push_front(item);
            }
            if self.persist_buffer {
                persist(&buffer);
            }
        }
    }

    pub fn buffer_len(&self) -> usize {
        self.buffer.lock().map(|b| b.len()).unwrap_or(0)
    }

    pub fn log(&self, outcome: &str, detail: String) {
        if let Ok(mut history) = self.history.lock() {
            if history.len() >= 20 {
                history.pop_front();
            }
            history.push_back(TickLog {
                at: now_iso(),
                seq: self.seq.load(Ordering::Relaxed),
                outcome: outcome.to_string(),
                detail,
            });
        }
    }

    pub fn history(&self) -> Vec<TickLog> {
        self.history.lock().map(|h| h.iter().cloned().collect()).unwrap_or_default()
    }

    pub fn last_signals(&self) -> SignalReport {
        self.last_signals.lock().map(|s| s.clone()).unwrap_or_default()
    }

    pub fn set_last_signals(&self, report: SignalReport) {
        if let Ok(mut slot) = self.last_signals.lock() {
            *slot = report;
        }
    }

    pub fn set_app_handle(&self, app: tauri::AppHandle) {
        if let Ok(mut slot) = self.app.lock() {
            *slot = Some(app);
        }
    }

    pub fn app_handle(&self) -> Option<tauri::AppHandle> {
        self.app.lock().ok().and_then(|a| a.clone())
    }

    pub fn support_code(&self) -> String {
        let username = self
            .enrollment
            .lock()
            .ok()
            .and_then(|e| e.as_ref().map(|e| e.username.clone()))
            .unwrap_or_else(|| "unenrolled".to_string());
        let machine = self
            .enrollment
            .lock()
            .ok()
            .and_then(|e| e.as_ref().map(|e| e.machine_id.clone()))
            .unwrap_or_default();
        super::identity::support_code(&username, &machine, &self.boot_id)
    }

    pub fn status_label(&self) -> &'static str {
        if !self.is_enrolled() {
            "Not enrolled"
        } else if self.revoked.load(Ordering::Relaxed) {
            "Enrollment revoked"
        } else if self.healthy() {
            "Proctoring: active"
        } else {
            "Proctoring: not reporting"
        }
    }
}

impl Default for AgentState {
    fn default() -> Self {
        Self::new()
    }
}

fn persist(buffer: &VecDeque<Heartbeat>) {
    if buffer.is_empty() {
        crate::config::clear_buffer();
        return;
    }
    if let Err(err) = crate::config::save_buffer(buffer) {
        log::warn!("could not persist the offline heartbeat buffer: {err}");
    }
}

/// Timestamps are formatted by hand to avoid pulling a date crate in for one
/// format string.
pub fn now_iso() -> String {
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    format_epoch(now.as_secs(), now.subsec_millis())
}

pub fn format_epoch(secs: u64, millis: u32) -> String {
    let days = secs / 86_400;
    let rem = secs % 86_400;
    let (year, month, day) = civil_from_days(days as i64);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{millis:03}Z",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

// Howard Hinnant's days-to-civil algorithm.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

pub fn dwell_summary(dwell: &HashMap<String, u64>) -> String {
    let mut entries: Vec<(&String, &u64)> = dwell.iter().collect();
    entries.sort_by(|a, b| b.1.cmp(a.1));
    entries
        .iter()
        .take(3)
        .map(|(app, ms)| format!("{app} {}s", *ms / 1000))
        .collect::<Vec<_>>()
        .join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_epoch_as_iso8601() {
        assert_eq!(format_epoch(0, 0), "1970-01-01T00:00:00.000Z");
        assert_eq!(format_epoch(1_767_225_600, 250), "2026-01-01T00:00:00.250Z");
    }

    #[test]
    fn buffer_drops_the_oldest_heartbeat_when_full() {
        let state = AgentState::ephemeral();
        for seq in 0..(BUFFER_CAPACITY as u64 + 10) {
            state.buffer_push(heartbeat(seq));
        }
        let taken = state.buffer_take();
        assert_eq!(taken.len(), BUFFER_CAPACITY);
        assert_eq!(taken.first().map(|h| h.seq), Some(10));
    }

    #[test]
    fn restoring_a_failed_flush_keeps_the_newest_heartbeats() {
        let state = AgentState::ephemeral();
        state.buffer_push(heartbeat(900));
        let mut items: Vec<Heartbeat> = (0..BUFFER_CAPACITY as u64).map(heartbeat).collect();
        items.push(heartbeat(500));
        state.buffer_restore(items);

        let taken = state.buffer_take();
        assert_eq!(taken.len(), BUFFER_CAPACITY);
        assert_eq!(taken.last().map(|h| h.seq), Some(900));
    }

    fn heartbeat(seq: u64) -> Heartbeat {
        Heartbeat {
            boot_id: "boot".into(),
            seq,
            mono_ms: seq * 1000,
            wall_ts: now_iso(),
            agent_version: crate::AGENT_VERSION.into(),
            loopback_port: 47615,
            attest_nonce: "nonce".into(),
            signal_hash: "hash".into(),
            buffered: true,
            shell_alive: false,
            signals: SignalReport::default(),
        }
    }
}
