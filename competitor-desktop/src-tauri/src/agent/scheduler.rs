use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, Instant};

use sysinfo::System;

use super::state::{dwell_summary, now_iso, AgentState, Heartbeat};
use super::transport::{SendError, Transport};
use crate::signals::{
    collect_matched_processes, get_foreground_app, lan_ip, probe_localhost_ports,
    scan_installed_ai_extensions, DwellTracker, PortMatch, ReachabilityProbe, SignalReport,
};
use crate::AGENT_VERSION;

/// The base tick. Everything else is a multiple of it, so foreground focus is
/// sampled far more often than the heartbeat that reports it.
const TICK: Duration = Duration::from_secs(5);

pub fn spawn(state: Arc<AgentState>) {
    std::thread::spawn(move || run(state));
}

fn run(state: Arc<AgentState>) {
    let transport = Transport::new();
    let mut system = System::new_all();
    let mut dwell = DwellTracker::new();
    let mut reachability = ReachabilityProbe::new();
    let mut cached_ports: Vec<PortMatch> = Vec::new();
    let mut cached_extensions: Vec<String> = scan_installed_ai_extensions();
    let mut lan = lan_ip();
    let mut tick: u64 = 0;

    loop {
        if state.stopping.load(Ordering::Relaxed) {
            return;
        }

        let now = Instant::now();
        let foreground = get_foreground_app();
        if foreground.supported {
            dwell.sample(&foreground.app_id, now);
        }

        let policy = state.policy.lock().map(|p| p.clone()).unwrap_or_default();
        let ticks_per = |seconds: u64| seconds.div_ceil(TICK.as_secs()).max(1);
        let due = |seconds: u64| tick % ticks_per(seconds) == 0;

        // Report on the very first tick. Waiting a full interval leaves the portal
        // with no acknowledged heartbeat to point at, which it can only read as
        // "this agent is not reporting" — a false network alarm every startup, and
        // 300 of them at once when a contest begins.
        let forced = state.take_forced_heartbeat();
        let enrolled = state.is_enrolled() && !state.revoked.load(Ordering::Relaxed);

        if enrolled && (forced || due(policy.heartbeat_seconds)) {
            reachability.probe();
            if due(60) {
                lan = lan_ip();
                cached_extensions = scan_installed_ai_extensions();
            }
            let processes = collect_matched_processes(&mut system, &policy.process_denylist);

            let report = SignalReport {
                foreground_dwell: dwell.drain(now),
                foreground_app: dwell.current(),
                ports: cached_ports.clone(),
                internet_reachable: reachability.reachable(),
                process_matches: processes.matches,
                total_processes: processes.total_count,
                lan_ip: lan.clone(),
                extension_matches: cached_extensions.clone(),
            };
            state.set_last_signals(report.clone());
            send(&state, &transport, report);
        }

        // Probed after the heartbeat so a first-run port sweep cannot delay the
        // first report; the results ride along on the next one.
        if due(policy.port_probe_seconds) {
            cached_ports = probe_localhost_ports();
        }

        if enrolled && tick > 0 && due(policy.rules_refresh_seconds) {
            refresh_policy(&state, &transport);
        }

        wait_for_next_tick(&state);
        tick = tick.wrapping_add(1);
    }
}

/// Sleeps out the tick, but wakes early once a heartbeat has been forced.
///
/// Enrolment forces one, and everything the contestant can actually see then waits
/// on the result: the setup window's first-report check, and the portal's lock
/// banner after it. Sleeping the full tick in the middle of that adds up to five
/// seconds of invisible waiting to the one moment someone is watching the screen
/// for a sign that proctoring works.
fn wait_for_next_tick(state: &Arc<AgentState>) {
    const SLICE: Duration = Duration::from_millis(100);

    let deadline = Instant::now() + TICK;
    while Instant::now() < deadline {
        if state.stopping.load(Ordering::Relaxed) || state.force_heartbeat_pending() {
            return;
        }
        std::thread::sleep(SLICE);
    }
}

fn send(state: &Arc<AgentState>, transport: &Transport, report: SignalReport) {
    let seq = state.seq.fetch_add(1, Ordering::Relaxed) + 1;
    let nonce = new_nonce();
    let summary = dwell_summary(&report.foreground_dwell);

    let heartbeat = Heartbeat {
        boot_id: state.boot_id(),
        seq,
        mono_ms: state.started_at.elapsed().as_millis() as u64,
        wall_ts: now_iso(),
        agent_version: AGENT_VERSION.to_string(),
        loopback_port: state.loopback_port.load(Ordering::Relaxed),
        attest_nonce: nonce.clone(),
        signal_hash: report.signal_hash(),
        buffered: false,
        shell_alive: state.shell_alive(),
        signals: report,
    };

    let (api_url, token) = match (state.api_url(), state.token()) {
        (url, Some(token)) if !url.is_empty() => (url, token),
        _ => return,
    };

    match transport.heartbeat(&api_url, &token, &heartbeat) {
        Ok(()) => {
            // Publish the nonce only once the server has stored it, so the portal
            // never presents a value the server has never seen.
            state.publish_nonce(nonce);
            state.on_ack();
            state.clear_rejections();
            state.log("sent", summary);
            flush_buffer(state, transport, &api_url, &token);
        }
        Err(SendError::Revoked) => {
            state.revoked.store(true, Ordering::Relaxed);
            state.on_error("enrollment revoked — re-enrol from the tray".to_string());
            state.log("revoked", "server rejected this agent credential".to_string());
        }
        Err(SendError::Rejected(detail)) => {
            state.on_error(format!("heartbeat rejected: {detail}"));
            state.log("rejected", detail);

            // A rejection the agent cannot fix by retrying would otherwise repeat
            // forever, and every one of those keeps submissions locked. Declaring a
            // fresh boot resets the sequence the server is objecting to.
            if state.note_rejection() >= 2 {
                state.log("recovering", "starting a new boot after repeated rejections".to_string());
                state.rotate_boot();
            }
        }
        Err(SendError::Unreachable(detail)) => {
            state.buffer_push(heartbeat);
            state.on_error(format!("server unreachable: {detail}"));
            state.log("buffered", detail);
        }
    }
}

/// Replays buffered heartbeats after a reconnect so a server-side outage leaves a
/// continuous timeline instead of a contestant-shaped hole in it.
fn flush_buffer(state: &Arc<AgentState>, transport: &Transport, api_url: &str, token: &str) {
    let pending = state.buffer_take();
    if pending.is_empty() {
        return;
    }

    let count = pending.len();
    match transport.flush(api_url, token, &pending) {
        Ok(()) => {
            state.buffer_clear();
            state.log("flushed", format!("{count} buffered heartbeats replayed"));
        }
        Err(SendError::Rejected(detail)) => {
            state.buffer_clear();
            state.log("flush_rejected", format!("{count} dropped: {detail}"));
        }
        Err(err) => {
            state.buffer_restore(pending);
            state.log("flush_failed", err.message());
        }
    }
}

fn refresh_policy(state: &Arc<AgentState>, transport: &Transport) {
    let (api_url, token) = match (state.api_url(), state.token()) {
        (url, Some(token)) if !url.is_empty() => (url, token),
        _ => return,
    };
    if let Ok(policy) = transport.policy(&api_url, &token) {
        if let Ok(mut slot) = state.policy.lock() {
            *slot = policy;
        }
    }
}

fn new_nonce() -> String {
    let mut value = uuid::Uuid::new_v4().to_string();
    value.retain(|c| c != '-');
    value
}

/// Records a deliberate stop before exiting. A clean stop is neutral evidence; a
/// hard kill is not, and the contestant deserves the difference to be visible.
pub fn report_shutdown(state: &Arc<AgentState>, reason: &str) {
    let transport = Transport::new();
    if let (api_url, Some(token)) = (state.api_url(), state.token()) {
        if !api_url.is_empty() {
            let _ = transport.shutdown(&api_url, &token, &state.boot_id(), reason);
        }
    }
}
