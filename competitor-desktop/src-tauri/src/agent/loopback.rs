use std::sync::atomic::Ordering;
use std::sync::Arc;

use tiny_http::{Header, Method, Response, Server};

use super::state::AgentState;
use crate::config::portal_origin;
use crate::LOOPBACK_PORTS;

/// Binds the loopback attestation server and returns the port it claimed.
///
/// The bind doubles as the agent's single-instance lock: a second agent cannot
/// claim a port that is already held, and two agents would otherwise produce two
/// heartbeat sequences and a permanent replay finding.
pub fn start(state: Arc<AgentState>) -> Option<u16> {
    for port in LOOPBACK_PORTS {
        match Server::http(("127.0.0.1", port)) {
            Ok(server) => {
                state.loopback_port.store(port, Ordering::Relaxed);
                let state = Arc::clone(&state);
                std::thread::spawn(move || serve(server, state));
                log::info!("loopback attestation server listening on 127.0.0.1:{port}");
                return Some(port);
            }
            Err(err) => log::warn!("could not bind 127.0.0.1:{port}: {err}"),
        }
    }
    None
}

/// Reports whether another agent already holds one of the loopback ports.
pub fn agent_already_running() -> bool {
    LOOPBACK_PORTS.iter().any(|port| probe(*port))
}

fn probe(port: u16) -> bool {
    use std::net::{SocketAddr, TcpStream};
    use std::time::Duration;

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(150)).is_ok()
}

fn serve(server: Server, state: Arc<AgentState>) {
    for request in server.incoming_requests() {
        let allowed_origin = portal_origin(&state.server_url());
        let request_origin = header(&request, "Origin");

        // Only the configured portal may read the nonce. Any other page in the
        // browser gets no CORS grant, so it cannot use this server to prove
        // co-location on the contestant's behalf.
        let cors_origin = match (&request_origin, allowed_origin.is_empty()) {
            (Some(origin), false) if *origin == allowed_origin => Some(origin.clone()),
            (None, _) => None,
            _ => {
                let _ = request.respond(with_cors(Response::from_string("").with_status_code(403), None));
                continue;
            }
        };

        let method = request.method().clone();
        let path = request.url().split('?').next().unwrap_or("").to_string();

        let response = match (&method, path.as_str()) {
            (Method::Options, _) => with_cors(Response::from_string("").with_status_code(204), cors_origin),
            (Method::Get, "/status") => {
                let body = status_json(&state);
                with_cors(
                    Response::from_string(body).with_header(json_header()),
                    cors_origin,
                )
            }
            (Method::Post, "/shell") => {
                state.mark_shell_alive();
                with_cors(Response::from_string("").with_status_code(204), cors_origin)
            }
            (Method::Post, "/setup") => {
                if let Some(app) = state.app_handle() {
                    // Window creation must happen on the main thread; this handler
                    // runs on the loopback listener's thread.
                    let handle = app.clone();
                    let _ = app.run_on_main_thread(move || super::windows::open_setup(&handle));
                }
                with_cors(Response::from_string("").with_status_code(204), cors_origin)
            }
            _ => with_cors(Response::from_string("").with_status_code(404), cors_origin),
        };

        if let Err(err) = request.respond(response) {
            log::warn!("loopback response failed: {err}");
        }
    }
}

fn status_json(state: &AgentState) -> String {
    let enrolled = state.is_enrolled();
    serde_json::json!({
        "agent_version": crate::AGENT_VERSION,
        "boot_id": state.boot_id,
        "seq": state.seq.load(Ordering::Relaxed),
        "uptime_s": state.uptime_seconds(),
        "enrolled": enrolled,
        "revoked": state.revoked.load(Ordering::Relaxed),
        "healthy": enrolled && state.healthy(),
        "seconds_since_ack": state.seconds_since_ack(),
        "buffered": state.buffer_len(),
        // The nonce is served only over loopback and only to the portal origin.
        // That is the whole mechanism: a page that can read it is running on this
        // machine.
        "attest_nonce": state.nonce(),
        "loopback_port": state.loopback_port.load(Ordering::Relaxed),
        "support_code": state.support_code(),
        "status": state.status_label(),
    })
    .to_string()
}

fn json_header() -> Header {
    Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
        .expect("static content-type header")
}

fn with_cors<R: std::io::Read>(response: Response<R>, origin: Option<String>) -> Response<R> {
    let mut response = response;
    if let Some(origin) = origin {
        if let Ok(header) = Header::from_bytes(&b"Access-Control-Allow-Origin"[..], origin.as_bytes()) {
            response = response.with_header(header);
        }
        for (name, value) in [
            ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
            ("Access-Control-Allow-Headers", "Content-Type"),
            ("Access-Control-Max-Age", "600"),
            ("Cache-Control", "no-store"),
        ] {
            if let Ok(header) = Header::from_bytes(name.as_bytes(), value.as_bytes()) {
                response = response.with_header(header);
            }
        }
    }
    response
}

fn header(request: &tiny_http::Request, field: &'static str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|h| h.field.equiv(field))
        .map(|h| h.value.as_str().to_string())
}
