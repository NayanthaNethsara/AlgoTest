use std::sync::atomic::Ordering;
use std::sync::Arc;

use tiny_http::{Header, Method, Response, Server};

use super::state::AgentState;
use crate::config::allowed_portal_origins;
use crate::LOOPBACK_PORTS;

/// Binds the loopback attestation server on the dedicated port.
pub fn start(state: Arc<AgentState>) -> Option<u16> {
    for &port in &LOOPBACK_PORTS {
        match Server::http((crate::LOOPBACK_IP, port)) {
            Ok(server) => {
                state.loopback_port.store(port, Ordering::Relaxed);
                let state = Arc::clone(&state);
                std::thread::spawn(move || serve(server, state));
                log::info!("loopback attestation server listening on {}:{port}", crate::LOOPBACK_IP);
                return Some(port);
            }
            Err(err) => {
                log::warn!("could not bind {}:{port}: {err}", crate::LOOPBACK_IP);
            }
        }
    }
    None
}

pub fn is_agent_running() -> bool {
    LOOPBACK_PORTS.iter().any(|port| probe(*port))
}

fn probe(port: u16) -> bool {
    use std::net::{SocketAddr, TcpStream};
    use std::time::Duration;

    let addr = SocketAddr::from((crate::LOOPBACK_IP, port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

fn serve(server: Server, state: Arc<AgentState>) {
    for request in server.incoming_requests() {
        let allowed_origin =
            allowed_portal_origins(&state.server_url(), &state.portal_origins());
        let request_origin = header(&request, "Origin");

        let cors_origin = match &request_origin {
            Some(origin) if crate::config::origin_matches(&allowed_origin, origin) => {
                Some(origin.clone())
            }
            None => None,
            Some(origin) => {
                state.log(
                    "origin_rejected",
                    format!("refused {origin}; this client is configured for {allowed_origin}"),
                );
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
            (Method::Post, "/setup") => {
                if let Some(app) = state.app_handle() {
                    super::windows::open_setup(&app);
                }
                with_cors(Response::from_string("").with_status_code(204), cors_origin)
            }
            (Method::Post, "/stop") => {
                let worker = Arc::clone(&state);
                let reason = if request_origin.is_some() {
                    "contestant signed out from the portal"
                } else {
                    "contestant exited from the competition shell"
                };
                std::thread::spawn(move || {
                    let Some(app) = worker.app_handle() else { return };
                    if let Err(err) = super::lifecycle::sign_out_and_quit(
                        &app,
                        &worker,
                        reason,
                    ) {
                        log::warn!("sign-out could not clear the enrollment: {err}");
                    }
                });
                with_cors(Response::from_string("").with_status_code(204), cors_origin)
            }
            (Method::Post, "/quit") if request_origin.is_none() => {
                let worker = Arc::clone(&state);
                std::thread::spawn(move || {
                    worker.stopping.store(true, Ordering::Relaxed);
                    super::scheduler::report_shutdown(&worker, "client reset on this machine");
                    match worker.app_handle() {
                        Some(app) => app.exit(0),
                        None => std::process::exit(0),
                    }
                });
                Response::from_string("").with_status_code(204)
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
        "boot_id": state.boot_id(),
        "seq": state.seq.load(Ordering::Relaxed),
        "uptime_s": state.uptime_seconds(),
        "enrolled": enrolled,
        "revoked": state.revoked.load(Ordering::Relaxed),
        "healthy": enrolled && state.healthy(),
        "starting": state.starting(),
        "seconds_since_ack": state.seconds_since_ack(),
        "buffered": state.buffer_len(),
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
            ("Access-Control-Allow-Headers", "Content-Type, Access-Control-Request-Private-Network, Cache-Control, Pragma, X-Requested-With, X-Proctor-Client"),
            ("Access-Control-Allow-Private-Network", "true"),
            ("Access-Control-Allow-Credentials", "true"),
            ("Access-Control-Max-Age", "600"),
            ("Cache-Control", "no-store, no-cache, must-revalidate"),
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
