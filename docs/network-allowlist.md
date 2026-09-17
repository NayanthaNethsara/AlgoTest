# Algothon Contest Environment - Network Firewall & Allowlist Specification

**Target Audience**: Network Administrators, Venue IT Teams, Exam Hall Technicians  
**Enforcement Policy**: **Default Deny** (Whitelist-only outbound access)

---

## Executive Summary

To preserve academic integrity and prevent cheating during Algothon competitions, contestant workstations (laptops/lab PCs) must be restricted to accessing:
1. The **Algothon Contest Platform** (Web Portal, CDN, and Backend API).
2. **Authorized Programming Language Documentation** (Rust, C, C++, Python, Java, JavaScript, and W3Schools).
3. **Internal Loopback Sockets** on `127.0.0.1` for proctor agent telemetry.

All other outbound Internet traffic—especially generative AI platforms, search engines, public code repositories, and communication channels—must be blocked at the network perimeter.

---

## 1. Mandatory Contest Platform Endpoints

The network gateway/firewall must permit outbound TCP traffic on **Port 443 (HTTPS/WSS)** to the following endpoints:

| Domain / FQDN | Port | Protocol | Function |
|---|---|---|---|
| `mini-algothon.vercel.app` | `443` | HTTPS | Contest Web Portal UI |
| `*.vercel.app` | `443` | HTTPS | Vercel Edge CDN, Webpack chunks, static assets |
| `mini-algothon-api.nayantha.me` | `443` | HTTPS / WSS | Backend API, submission grading, SSE/WebSocket live events |

### Network Protocol Requirements
- **DNS Resolution**: Allow UDP and TCP port `53` to local network DNS servers or upstream resolvers (`1.1.1.1`, `8.8.8.8`).
- **Persistent Connections**: The network gateway and stateful firewalls must permit long-lived HTTPS/WSS streams and Server-Sent Events (SSE) to `mini-algothon-api.nayantha.me`. Do not drop idle TCP sessions under 60 seconds.

---

## 2. Authorized Documentation & Reference Allowlist

Contestants are permitted read-only access to standard library references and language tutorials. Permit outbound TCP port `443 (HTTPS)` to the following domains:

| Language / Tool | Resource Description | Required Domains & CDNs |
|---|---|---|
| **Rust** | Official Rust Docs & Standard Library | `doc.rust-lang.org`<br>`*.rust-lang.org` |
| **C & C++** | Cppreference (C and C++ Standard Reference) | `en.cppreference.com`<br>`*.cppreference.com` |
| **Python** | Python Official Documentation | `docs.python.org`<br>`*.python.org` |
| **Java** | Oracle Java SE Documentation | `docs.oracle.com`<br>`dev.java` |
| **JavaScript** | MDN Web Docs (Mozilla JavaScript Reference) | `developer.mozilla.org`<br>`*.mozilla.org`<br>`*.mozilla.net` |
| **Tutorials / Reference** | W3Schools Web & Language Tutorials | `www.w3schools.com`<br>`*.w3schools.com` |

---

## 3. Workstation Loopback Requirements

The **Algothon Desktop Proctor Agent** runs locally on contestant machines and establishes a local loopback HTTP server to attest integrity directly to the contest browser.

Host-level firewall policies (Windows Defender Firewall, macOS `pf`, endpoint security software, or antivirus) **must not block loopback sockets**:

- **Target IP**: `127.0.0.1` (`localhost`)
- **Port Range**: `47615` - `47620` (TCP)
- **Interface**: Local loopback (`lo` on Linux, `lo0` on macOS, Loopback on Windows)
- **Direction**: Inbound and outbound

---

## 4. Blocklist / Default-Deny Policy

The network gateway should drop or reject all traffic outside the explicit allowlists above, with particular emphasis on:

### Blocked Protocols & Ports
- **Plain HTTP (Port 80)**: Block outbound (all platform traffic is strictly HTTPS 443).
- **Remote Access & File Transfer**: Ports `22` (SSH), `21` (FTP), `23` (Telnet), `3389` (RDP).

### Blocked Web Domains
- **Generative AI & LLM Endpoints**:
  - `*.openai.com`, `*.chatgpt.com`
  - `*.anthropic.com`, `*.claude.ai`
  - `*.deepseek.com`
  - `*.cohere.ai`
  - `*.gemini.google.com`
  - `*.copilot.microsoft.com`
- **Search Engines & Search Aggregators**:
  - `*.google.com`, `*.bing.com`, `*.duckduckgo.com`, `*.yahoo.com`
- **Code Repositories & Collaboration**:
  - `*.github.com`, `*.gitlab.com`, `*.bitbucket.org`, `*.stackoverflow.com`, `*.stackexchange.com`
- **Messaging & Communication**:
  - `*.discord.com`, `*.slack.com`, `*.telegram.org`, `*.whatsapp.com`, `*.wechat.com`

---

## 5. Verification Checklist for Network Administrator

Run the following diagnostics from a contestant workstation on the contest network:

### 1. Verify Platform Connectivity
```bash
curl -I https://mini-algothon.vercel.app
curl -I https://mini-algothon-api.nayantha.me/health
```
*Expected Result: `HTTP/2 200` or `HTTP/1.1 200 OK`.*

### 2. Verify Documentation Sites
```bash
curl -I https://doc.rust-lang.org
curl -I https://en.cppreference.com
curl -I https://docs.python.org
curl -I https://docs.oracle.com
curl -I https://developer.mozilla.org
curl -I https://www.w3schools.com
```
*Expected Result: `HTTP/2 200` or `301/302 Redirect to HTTPS`.*

### 3. Verify Blocked Destinations
```bash
curl -I --connect-timeout 3 https://www.google.com
curl -I --connect-timeout 3 https://chatgpt.com
curl -I --connect-timeout 3 https://github.com
```
*Expected Result: Connection timeout or firewall reset (`Connection refused`).*
