use std::time::Duration;

use serde::Deserialize;

use super::state::{Heartbeat, Policy};
use crate::config::Enrollment;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
const FLUSH_TIMEOUT: Duration = Duration::from_secs(20);

pub enum SendError {
    /// The server said this enrollment is finished. The agent must stop retrying
    /// and ask the contestant to enroll again rather than hammer a dead token.
    Revoked,
    /// The server rejected the heartbeat itself (a replayed sequence). Buffering it
    /// for a retry would just replay it again.
    Rejected(String),
    Unreachable(String),
}

impl SendError {
    pub fn message(&self) -> String {
        match self {
            SendError::Revoked => "enrollment revoked".to_string(),
            SendError::Rejected(detail) => format!("rejected: {detail}"),
            SendError::Unreachable(detail) => detail.clone(),
        }
    }
}

#[derive(Deserialize)]
struct EnrollResponse {
    agent_id: String,
    agent_token: String,
    user_id: String,
    username: String,
    display_name: String,
    policy: Policy,
}

pub struct Transport {
    client: reqwest::blocking::Client,
    flush_client: reqwest::blocking::Client,
}

impl Transport {
    pub fn new() -> Self {
        Self {
            client: build_client(REQUEST_TIMEOUT),
            flush_client: build_client(FLUSH_TIMEOUT),
        }
    }

    pub fn enroll(
        &self,
        api_url: &str,
        username: &str,
        password: &str,
        machine_id: &str,
        platform: &str,
        consent_version: &str,
    ) -> Result<(Enrollment, Policy), String> {
        let response = self
            .client
            .post(format!("{}/api/v1/agent/enroll", api_url.trim_end_matches('/')))
            .json(&serde_json::json!({
                "username": username,
                "password": password,
                "machine_id": machine_id,
                "platform": platform,
                "agent_version": crate::AGENT_VERSION,
                "consent_version": consent_version,
            }))
            .send()
            .map_err(|e| format!("could not reach the contest server: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body: serde_json::Value = response.json().unwrap_or_default();
            let detail = body
                .get("error")
                .and_then(|e| e.as_str())
                .unwrap_or("enrollment failed");
            return Err(format!("{detail} ({status})"));
        }

        let parsed: EnrollResponse = response.json().map_err(|e| e.to_string())?;
        Ok((
            Enrollment {
                agent_id: parsed.agent_id,
                agent_token: parsed.agent_token,
                user_id: parsed.user_id,
                username: parsed.username,
                display_name: parsed.display_name,
                machine_id: machine_id.to_string(),
                consent_version: consent_version.to_string(),
            },
            parsed.policy,
        ))
    }

    pub fn heartbeat(&self, api_url: &str, token: &str, hb: &Heartbeat) -> Result<(), SendError> {
        let response = self
            .client
            .post(format!("{api_url}/api/v1/agent/heartbeat"))
            .bearer_auth(token)
            .json(hb)
            .send()
            .map_err(|e| SendError::Unreachable(e.to_string()))?;
        classify(response)
    }

    pub fn flush(&self, api_url: &str, token: &str, batch: &[Heartbeat]) -> Result<(), SendError> {
        let response = self
            .flush_client
            .post(format!("{api_url}/api/v1/agent/events"))
            .bearer_auth(token)
            .json(&serde_json::json!({ "heartbeats": batch }))
            .send()
            .map_err(|e| SendError::Unreachable(e.to_string()))?;
        classify(response)
    }

    pub fn shutdown(&self, api_url: &str, token: &str, boot_id: &str, reason: &str) -> Result<(), SendError> {
        let response = self
            .client
            .post(format!("{api_url}/api/v1/agent/shutdown"))
            .bearer_auth(token)
            .json(&serde_json::json!({ "reason": reason, "boot_id": boot_id }))
            .send()
            .map_err(|e| SendError::Unreachable(e.to_string()))?;
        classify(response)
    }

    pub fn policy(&self, api_url: &str, token: &str) -> Result<Policy, SendError> {
        let response = self
            .client
            .get(format!("{api_url}/api/v1/agent/rules"))
            .bearer_auth(token)
            .send()
            .map_err(|e| SendError::Unreachable(e.to_string()))?;

        if response.status() == reqwest::StatusCode::GONE {
            return Err(SendError::Revoked);
        }
        if !response.status().is_success() {
            return Err(SendError::Unreachable(format!("policy fetch: {}", response.status())));
        }
        response
            .json::<Policy>()
            .map_err(|e| SendError::Unreachable(e.to_string()))
    }

    pub fn disclosure(&self, api_url: &str) -> Result<serde_json::Value, String> {
        let response = self
            .client
            .get(format!("{}/api/v1/proctor/disclosure", api_url.trim_end_matches('/')))
            .send()
            .map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("disclosure fetch: {}", response.status()));
        }
        response.json().map_err(|e| e.to_string())
    }
}

fn classify(response: reqwest::blocking::Response) -> Result<(), SendError> {
    let status = response.status();
    if status.is_success() {
        return Ok(());
    }
    if status == reqwest::StatusCode::GONE || status == reqwest::StatusCode::UNAUTHORIZED {
        return Err(SendError::Revoked);
    }
    if status == reqwest::StatusCode::CONFLICT || status == reqwest::StatusCode::BAD_REQUEST {
        return Err(SendError::Rejected(status.to_string()));
    }
    Err(SendError::Unreachable(status.to_string()))
}

fn build_client(timeout: Duration) -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .timeout(timeout)
        .user_agent(format!("mini-algothon-agent/{}", crate::AGENT_VERSION))
        .build()
        .unwrap_or_default()
}

impl Default for Transport {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn send_error_messages() {
        assert_eq!(SendError::Revoked.message(), "enrollment revoked");
        assert_eq!(SendError::Rejected("invalid seq".into()).message(), "rejected: invalid seq");
        assert_eq!(SendError::Unreachable("timeout".into()).message(), "timeout");
    }
}
