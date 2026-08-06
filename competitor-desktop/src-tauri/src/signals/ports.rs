use serde::{Deserialize, Serialize};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PortMatch {
    pub port: u16,
    pub rule_id: String,
    pub product: String,
    pub confirmed: bool,
}

struct TargetPort {
    port: u16,
    path: &'static str,
    expected_substring: &'static str,
    rule_id: &'static str,
    product: &'static str,
}

const TARGET_PORTS: &[TargetPort] = &[
    TargetPort {
        port: 11434,
        path: "/api/tags",
        expected_substring: "models",
        rule_id: "ai.port.ollama",
        product: "Ollama",
    },
    TargetPort {
        port: 1234,
        path: "/v1/models",
        expected_substring: "object",
        rule_id: "ai.port.lmstudio",
        product: "LM Studio",
    },
    TargetPort {
        port: 1337,
        path: "/v1/models",
        expected_substring: "object",
        rule_id: "ai.port.jan",
        product: "Jan",
    },
    TargetPort {
        port: 4891,
        path: "/v1/models",
        expected_substring: "object",
        rule_id: "ai.port.jan",
        product: "GPT4All",
    },
    TargetPort {
        port: 8080,
        path: "/v1/models",
        expected_substring: "object",
        rule_id: "ai.port.llama_server",
        product: "llama-server / vLLM",
    },
    TargetPort {
        port: 8000,
        path: "/v1/models",
        expected_substring: "object",
        rule_id: "ai.port.llama_server",
        product: "vLLM / LocalAI",
    },
    TargetPort {
        port: 5000,
        path: "/api/v1/model",
        expected_substring: "result",
        rule_id: "ai.port.kobold",
        product: "KoboldCpp",
    },
];

pub fn probe_localhost_ports() -> Vec<PortMatch> {
    let mut matches = Vec::new();
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(400))
        .build()
        .unwrap_or_default();

    for target in TARGET_PORTS {
        let addr: SocketAddr = format!("127.0.0.1:{}", target.port).parse().unwrap();
        if TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok() {
            let url = format!("http://127.0.0.1:{}{}", target.port, target.path);
            let mut confirmed = false;

            if let Ok(resp) = client.get(&url).send() {
                if let Ok(body) = resp.text() {
                    if body.contains(target.expected_substring) {
                        confirmed = true;
                    }
                }
            }

            matches.push(PortMatch {
                port: target.port,
                rule_id: target.rule_id.to_string(),
                product: target.product.to_string(),
                confirmed,
            });
        }
    }

    matches
}
