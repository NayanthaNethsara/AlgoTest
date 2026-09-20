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
| `competitor-portal--algothon-2026.asia-southeast1.hosted.app` | `443` | HTTPS | Contest Web Portal UI |
| `mini-algothon-api.nayantha.me` | `443` | HTTPS | Backend API, submission grading, and long-lived Server-Sent Events (SSE) |

Do **not** allow all of `*.hosted.app` or `*.run.app`. The portal serves its
Next.js and Monaco assets from its own hostname, while those wildcards would
also make unrelated third-party applications on the same hosting platforms
reachable from contestant machines.

### Network Protocol Requirements
- **DNS Resolution**: Allow UDP and TCP port `53` only to the venue-approved DNS resolver. Do not permit arbitrary public DNS or DNS-over-HTTPS endpoints, because they can bypass DNS-based filtering.
- **Persistent Connections**: The network gateway and stateful firewalls must permit long-lived HTTPS connections used for SSE to `mini-algothon-api.nayantha.me`. Do not drop idle TCP sessions under 60 seconds.
- **Editor Runtime**: Permit JavaScript Web Workers and `blob:` URLs for the competitor portal. Monaco creates a local worker using a `blob:` URL; this is a browser capability, not another Internet hostname. Disable HTTPS inspection features that rewrite or sanitize the portal's JavaScript responses.

---

## 2. Authorized Documentation & Reference Allowlist

Contestants are permitted read-only access to standard library references and language tutorials. Permit outbound TCP port `443 (HTTPS)` to the following domains:

| Language / Tool | Resource Description | Required Domains & CDNs |
|---|---|---|
| **Rust** | Official Rust Docs & Standard Library | `doc.rust-lang.org` |
| **C & C++** | Cppreference (C and C++ Standard Reference) | `en.cppreference.com` |
| **Python** | Python Official Documentation | `docs.python.org` |
| **Java** | Oracle Java SE Documentation | `docs.oracle.com`<br>`dev.java` |
| **JavaScript** | MDN Web Docs (Mozilla JavaScript Reference) | `developer.mozilla.org` |
| **Tutorials / Reference** | W3Schools Web & Language Tutorials | `www.w3schools.com` |

Some documentation pages may reference optional assets on additional hosts.
Keep those blocked unless venue testing proves that a specific host is required;
do not replace this exact list with broad parent-domain wildcards.

---

## 3. Workstation Loopback Requirements

The **Algothon Desktop Proctor Agent** runs locally on contestant machines and establishes a local loopback HTTP server to attest integrity directly to the contest browser.

This is a **workstation host-firewall exception**, not an Internet gateway
allowlist entry. Host-level firewall policies (Windows Defender Firewall,
macOS `pf`, endpoint security software, or antivirus) **must not block loopback sockets**:

- **Target IP**: `127.0.0.1` (`localhost`)
- **Port Range**: `47615` - `47619` (TCP, local HTTP)
- **Interface**: Local loopback (`lo` on Linux, `lo0` on macOS, Loopback on Windows)
- **Direction**: Inbound and outbound

### Can the venue network block these local ports?

An ordinary router, Wi-Fi access point, or perimeter firewall cannot directly
filter a connection to `127.0.0.1`: that traffic stays inside the workstation
and never reaches the venue network. Wi-Fi client isolation (blocking traffic
between contestants' computers) should therefore not affect this connection.

Venue-managed settings can still interfere indirectly: a proxy/PAC configuration
that routes local requests through a proxy, browser restrictions, VPN/security
software, or a workstation firewall policy applied on that network. Ensure
`localhost` and `127.0.0.1` bypass proxies and that endpoint policies permit the
portal to contact the local agent. Browsers commonly bypass loopback by default;
check for overrides rather than assuming a proxy is the cause.

Allow the portal's local/loopback access permission where the browser requires
it. Permission names vary by browser/version; see the
[Chrome Local Network Access documentation](https://developer.chrome.com/blog/local-network-access).
Scope any managed exception to the exact competitor portal origin. Do not
disable browser security globally, expose these ports to the LAN/Internet,
add port forwarding, or change the agent to listen on `0.0.0.0`.

### Client online, but same-device verification fails

The error “Submit from the proctor client, or reload the portal so it can reach
the agent” means the submission did not provide valid same-device attestation.
“Client online” confirms the agent-to-backend connection; it does not confirm
that the browser can reach that agent locally or that its proof matches the
account's current enrollment.

1. Test the same computer, browser profile, and account on the venue network
   and a mobile hotspot. Success only on the hotspot suggests a network-specific
   configuration or policy, but does not prove the router blocks loopback.
2. On the venue network, open the portal's developer tools → Network, reload,
   and inspect requests to `http://127.0.0.1:47615/status` through port `47619`.
   Only the agent's active port needs to respond; failed probes to other ports
   can be normal.
3. Record the failing request's error and the corresponding Console message.
   Permission/policy errors indicate browser restrictions; connection refusal
   can mean no listener on that port; timeouts can indicate filtering or an
   unresponsive agent. CORS errors need origin/header investigation. A status
   response alone does not prove the backend accepted the attestation.
4. Check the portal's local-access permission, proxy/PAC loopback bypass, and
   workstation/VPN security logs. Ask IT: “Does a network-specific device or
   browser policy prevent this portal from reaching `127.0.0.1:47615–47619`?”

Do not share raw status response bodies or attestation nonces when reporting
the failure; the request URL and error message are sufficient for initial diagnosis.

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
curl -I https://competitor-portal--algothon-2026.asia-southeast1.hosted.app
curl -I https://competitor-portal--algothon-2026.asia-southeast1.hosted.app/monaco/vs/loader.js
curl -I https://competitor-portal--algothon-2026.asia-southeast1.hosted.app/monaco/vs/editor/editor.main.js
curl -I https://mini-algothon-api.nayantha.me/healthz
```
*Expected Result: `200 OK` for the assets and health endpoint. The portal root
may return a `307` redirect to `/login` or `/challenges`, which is also expected.*

After these checks pass, open a challenge in a supported browser and verify
that the Monaco editor replaces the “Loading editor…” placeholder. If it does
not, inspect the browser console for a blocked `blob:` worker or JavaScript
response rewriting by endpoint-security software.

#### Troubleshoot an editor stuck on “Loading editor…”

Open browser developer tools on the affected workstation, select **Console**,
and run the checks below while connected to the contest network.

First, confirm that Monaco resolves to the same origin as the portal:

```js
const asset = new URL("/monaco/vs/loader.js", location.href);

console.log({
  pageOrigin: location.origin,
  assetOrigin: asset.origin,
  sameOrigin: asset.origin === location.origin,
  assetURL: asset.href,
});
```

`sameOrigin` must be `true`. No separate Monaco CDN hostname is required.

Next, verify all primary Monaco resources:

```js
Promise.all(
  [
    "/monaco/vs/loader.js",
    "/monaco/vs/editor/editor.main.js",
    "/monaco/vs/editor/editor.main.css",
    "/monaco/vs/nls.messages-loader.js",
    "/monaco/vs/basic-languages/monaco.contribution.js",
  ].map(async (path) => {
    try {
      const response = await fetch(path);
      return {
        path,
        status: response.status,
        type: response.headers.get("content-type"),
      };
    } catch (error) {
      return { path, error: String(error) };
    }
  }),
).then(console.table);
```

Every resource must return status `200`. Then verify that the browser permits
the local `blob:` worker used by Monaco:

```js
const workerURL = URL.createObjectURL(
  new Blob([`self.postMessage("worker is working")`], {
    type: "application/javascript",
  }),
);

const worker = new Worker(workerURL);

worker.onmessage = (event) => {
  console.log(event.data);
  worker.terminate();
  URL.revokeObjectURL(workerURL);
};

worker.onerror = (error) => console.error("Worker failed:", error);
```

The expected console output is `worker is working`. Finally, list every Monaco
resource requested by the page:

```js
performance
  .getEntriesByType("resource")
  .filter((entry) => entry.name.includes("/monaco/"))
  .map((entry) => entry.name);
```

All HTTP resources must begin with the exact competitor portal hostname.
Interpret failures as follows:

- A Monaco resource is not `200`: the gateway, proxy, or endpoint filter is
  blocking, rewriting, or caching that JavaScript/CSS response.
- The worker test fails: browser management or endpoint security is blocking
  Web Workers or `blob:` URLs.
- All checks pass but the placeholder remains: inspect the first red Console
  error, clear site data and browser cache, and reload the page.
- The editor works on another network: bypass SSL/HTTPS inspection and
  JavaScript content rewriting for the exact competitor portal hostname.

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
