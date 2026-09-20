use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};

use serde::{Deserialize, Serialize};

use crate::config::{ClientConfig, Enrollment};
use crate::signals::SignalReport;

pub const BUFFER_CAPACITY: usize = 240;

/// Matches the server's ONLINE boundary.
pub const HEALTHY_WINDOW: Duration = Duration::from_secs(45);

/// Measured from when the agent last began trying to report.
pub const STARTUP_GRACE: Duration = Duration::from_secs(60);


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
    pub boot_id: Mutex<String>,
    pub started_at: Instant,
    reporting_since: Mutex<Instant>,
    pub client: Mutex<ClientConfig>,
    pub enrollment: Mutex<Option<Enrollment>>,
    pub policy: Mutex<Policy>,
    pub seq: AtomicU64,
    pub loopback_port: AtomicU16,
    pub published_nonce: Mutex<String>,
    pub last_ack: Mutex<Option<Instant>>,
    pub last_ack_wall: Mutex<Option<SystemTime>>,
    pub last_error: Mutex<Option<String>>,
    pub buffer: Mutex<VecDeque<Heartbeat>>,
    pub history: Mutex<VecDeque<TickLog>>,
    pub last_signals: Mutex<SignalReport>,
    pub app: Mutex<Option<tauri::AppHandle>>,
    force_heartbeat: AtomicBool,
    consecutive_rejections: AtomicU64,
    pub stopping: AtomicBool,
    pub revoked: AtomicBool,
    persist_buffer: AtomicBool,
}

impl AgentState {
    pub fn new() -> Self {
        Self {
            persist_buffer: AtomicBool::new(true),
            boot_id: Mutex::new(uuid::Uuid::new_v4().to_string()),
            started_at: Instant::now(),
            reporting_since: Mutex::new(Instant::now()),
            client: Mutex::new(crate::config::load_client()),
            enrollment: Mutex::new(crate::config::load_enrollment()),
            policy: Mutex::new(Policy::default()),
            seq: AtomicU64::new(0),
            loopback_port: AtomicU16::new(0),
            published_nonce: Mutex::new(String::new()),
            last_ack: Mutex::new(None),
            last_ack_wall: Mutex::new(None),
            last_error: Mutex::new(None),
            buffer: Mutex::new(load_bounded_buffer()),
            history: Mutex::new(VecDeque::with_capacity(20)),
            last_signals: Mutex::new(SignalReport::default()),
            app: Mutex::new(None),
            force_heartbeat: AtomicBool::new(false),
            consecutive_rejections: AtomicU64::new(0),
            stopping: AtomicBool::new(false),
            revoked: AtomicBool::new(false),
        }
    }

    #[cfg(test)]
    fn ephemeral() -> Self {
        let state = Self::new();
        state.stop_persisting();
        state.buffer_take();
        state
    }

    pub fn stop_persisting(&self) {
        self.persist_buffer.store(false, Ordering::Relaxed);
    }

    fn is_persisting(&self) -> bool {
        self.persist_buffer.load(Ordering::Relaxed)
    }

    pub fn boot_id(&self) -> String {
        self.boot_id.lock().map(|b| b.clone()).unwrap_or_default()
    }

    pub fn note_rejection(&self) -> u64 {
        self.consecutive_rejections.fetch_add(1, Ordering::Relaxed) + 1
    }

    pub fn clear_rejections(&self) {
        self.consecutive_rejections.store(0, Ordering::Relaxed);
    }

    pub fn rotate_boot(&self) {
        if let Ok(mut boot) = self.boot_id.lock() {
            *boot = uuid::Uuid::new_v4().to_string();
        }
        self.seq.store(0, Ordering::Relaxed);
        self.force_heartbeat();
    }

    pub fn api_url(&self) -> String {
        self.client
            .lock()
            .map(|c| c.api_url.trim_end_matches('/').to_string())
            .unwrap_or_default()
    }

    pub fn server_url(&self) -> String {
        self.client.lock().map(|c| c.server_url.clone()).unwrap_or_default()
    }

    pub fn portal_origins(&self) -> String {
        let configured = self.client.lock().map(|c| c.portal_origins.clone()).unwrap_or_default();
        if configured.trim().is_empty() {
            crate::config::DEFAULT_PORTAL_ORIGINS.to_string()
        } else {
            format!("{},{}", crate::config::DEFAULT_PORTAL_ORIGINS, configured)
        }
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

    pub fn force_heartbeat(&self) {
        self.force_heartbeat.store(true, Ordering::Relaxed);
    }

    pub fn take_forced_heartbeat(&self) -> bool {
        self.force_heartbeat.swap(false, Ordering::Relaxed)
    }

    pub fn force_heartbeat_pending(&self) -> bool {
        self.force_heartbeat.load(Ordering::Relaxed)
    }

    pub fn mark_reporting_start(&self) {
        if let Ok(mut slot) = self.reporting_since.lock() {
            *slot = Instant::now();
        }
    }

    pub fn starting(&self) -> bool {
        let since = self
            .reporting_since
            .lock()
            .map(|since| since.elapsed())
            .unwrap_or_default();

        self.is_enrolled()
            && self.last_ack.lock().ok().and_then(|a| *a).is_none()
            && since < STARTUP_GRACE
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
            if self.is_persisting() {
                persist(&buffer);
            }
        }
    }

    pub fn buffer_take(&self) -> Vec<Heartbeat> {
        self.buffer
            .lock()
            .map(|mut buffer| buffer.drain(..).collect())
            .unwrap_or_default()
    }

    pub fn buffer_clear(&self) {
        if let Ok(mut buffer) = self.buffer.lock() {
            buffer.clear();
        }
        if self.is_persisting() {
            crate::config::clear_buffer();
        }
    }

    pub fn buffer_restore(&self, mut items: Vec<Heartbeat>) {
        if let Ok(mut buffer) = self.buffer.lock() {
            let total = items.len() + buffer.len();
            if total > BUFFER_CAPACITY {
                let excess = (total - BUFFER_CAPACITY).min(items.len());
                items.drain(..excess);
            }
            for item in items.into_iter().rev() {
                buffer.push_front(item);
            }
            if self.is_persisting() {
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
        let (username, machine) = self
            .enrollment
            .lock()
            .ok()
            .and_then(|slot| {
                slot.as_ref().map(|e| (e.username.clone(), e.machine_id.clone()))
            })
            .unwrap_or_else(|| ("unenrolled".to_string(), String::new()));
        super::identity::support_code(&username, &machine, &self.boot_id())
    }

    pub fn status_label(&self) -> &'static str {
        if !self.is_enrolled() {
            "Not enrolled"
        } else if self.revoked.load(Ordering::Relaxed) {
            "Enrollment revoked"
        } else if self.healthy() {
            "Proctoring: active"
        } else if self.starting() {
            "Proctoring: starting"
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

fn load_bounded_buffer() -> VecDeque<Heartbeat> {
    let mut buffer = crate::config::load_buffer::<VecDeque<Heartbeat>>()
        .unwrap_or_else(|| VecDeque::with_capacity(BUFFER_CAPACITY));
    while buffer.len() > BUFFER_CAPACITY {
        buffer.pop_front();
    }
    buffer
}

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
