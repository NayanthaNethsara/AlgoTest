use std::collections::HashMap;
use std::time::Instant;

/// Accumulates how long each application held focus between heartbeats.
///
/// A single instantaneous sample every 15 seconds misses a ten-second glance at a
/// tethered browser entirely. Sampling every few seconds and reporting dwell keeps
/// the payload just as small while making short visits visible.
pub struct DwellTracker {
    totals: HashMap<String, u64>,
    current: Option<String>,
    since: Instant,
}

impl DwellTracker {
    pub fn new() -> Self {
        Self { totals: HashMap::new(), current: None, since: Instant::now() }
    }

    pub fn sample(&mut self, app_id: &str, now: Instant) {
        let elapsed = now.duration_since(self.since).as_millis() as u64;
        if let Some(previous) = self.current.clone() {
            *self.totals.entry(previous).or_insert(0) += elapsed;
        }
        self.since = now;
        self.current = if app_id.is_empty() { None } else { Some(app_id.to_string()) };
    }

    /// Returns the accumulated dwell and starts a fresh window, keeping the
    /// currently focused app as the open interval.
    pub fn drain(&mut self, now: Instant) -> HashMap<String, u64> {
        let elapsed = now.duration_since(self.since).as_millis() as u64;
        if let Some(current) = self.current.clone() {
            *self.totals.entry(current).or_insert(0) += elapsed;
        }
        self.since = now;
        std::mem::take(&mut self.totals)
    }

    pub fn current(&self) -> String {
        self.current.clone().unwrap_or_default()
    }
}

impl Default for DwellTracker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn accumulates_dwell_across_focus_changes() {
        let start = Instant::now();
        let mut tracker = DwellTracker::new();

        tracker.sample("editor", start);
        tracker.sample("browser", start + Duration::from_secs(10));
        let totals = tracker.drain(start + Duration::from_secs(15));

        assert!(totals["editor"] >= 10_000, "editor dwell was {:?}", totals.get("editor"));
        assert!(totals["browser"] >= 5_000, "browser dwell was {:?}", totals.get("browser"));
    }

    #[test]
    fn draining_keeps_the_focused_app_open() {
        let start = Instant::now();
        let mut tracker = DwellTracker::new();

        tracker.sample("editor", start);
        tracker.drain(start + Duration::from_secs(5));
        let totals = tracker.drain(start + Duration::from_secs(10));

        assert!(totals["editor"] >= 5_000, "second window should still credit the focused app");
        assert_eq!(tracker.current(), "editor");
    }
}
