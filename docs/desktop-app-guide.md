# Competitor Desktop Application Guide

This guide covers installation, Gatekeeper troubleshooting, building, and deployment for the
**Algothon Competitor Client** (Tauri v2 + Rust). See
[client-design.md](client-design.md) for why it is built the way it is.

---

## 1. Installation & Troubleshooting Guide

### macOS Installation

Two separate things stop the app on macOS. Check the first before troubleshooting the second.

#### Prerequisite: the bundle must match the Mac's architecture

The `aarch64` bundle runs only on Apple Silicon. An Intel Mac will not launch it at all — this is
not a Gatekeeper prompt, there is nothing to bypass. Check what you have:

```bash
lipo -archs /path/to/mini-algothon-competitor.app/Contents/MacOS/app
```

`arm64` alone is Apple Silicon only. `x86_64 arm64` is universal and runs everywhere. Build the
universal bundle when contestants may be on either — see [§4](#4-building-the-client).

#### Gatekeeper quarantine

macOS attaches `com.apple.quarantine` to anything a browser downloads. The client is ad-hoc
signed — valid, but without an Apple Developer ID — so Gatekeeper refuses it until the attribute
is removed. What you see depends on the macOS version:

| Message | Meaning |
| --- | --- |
| *"Apple could not verify … is free of malware"* | macOS 15+, normal for an unnotarized app |
| *"cannot be opened because it is from an unidentified developer"* | macOS 14 and earlier, same cause |
| *"is damaged and can't be opened. You should move it to the Trash"* | The signature is inconsistent, not merely unsigned. An official build should never show this — report it rather than working around it |

#### Solution: remove the attribute (works on every version)

Copy the app out of the DMG to `/Applications` **first**, then:

```bash
xattr -dr com.apple.quarantine /Applications/mini-algothon-competitor.app
open /Applications/mini-algothon-competitor.app
```

Run it against the app's final location. Removing the attribute and then moving the app is fine;
downloading it again re-applies it.

#### Solution: the GUI path

This differs by version, and the older instructions no longer work:

- **macOS 14 and earlier** — Control-click the app → **Open** → **Open** in the dialog.
- **macOS 15 (Sequoia) and later** — Apple removed that shortcut. Double-click the app and let it
  be blocked, then go to **System Settings → Privacy & Security**, scroll to the bottom, and click
  **Open Anyway** beside the app's name. Double-click it again and confirm.

Notarizing the build (a paid Apple Developer account) is the only way the app simply opens with no
step for the contestant at all.

---

### Windows Installation

The Windows release artifact is provided in two forms:

1. **Standalone Portable Executable (`.exe`)**:
   - No installation wizard required.
   - Simply double-click `mini-algothon-competitor_portable.exe` to run directly.
2. **Standard Installer (`.exe` / `.msi`)**:
   - Installs the app into `Program Files` and creates Start Menu and Desktop shortcuts.

---

### Linux Installation

The Linux release artifact is bundled as a standalone `AppImage`.

1. Grant execution permission:
   ```bash
   chmod +x mini-algothon-competitor.AppImage
   ```
2. Run the executable:
   ```bash
   ./mini-algothon-competitor.AppImage
   ```

---

### Stopping & Cleaning Up Legacy or Conflicting Installations

If a machine previously ran an older version of the Algothon application (such as the legacy unified shell `mini-algothon-competitor`), residual background processes, autostart configurations, or cache files can cause conflicts:

1. **Loopback Port Conflicts (`47615`)**: A stale background agent instance may hold port `47615`, blocking a newly installed standalone agent from starting or responding to portal attestation requests.
2. **Legacy Multi-Display Lockouts**: Earlier competition shell builds monitored screen configurations and locked the display with blackout curtains when external or virtual monitors (Sidecar, AirPlay, BetterDisplay, DisplayLink) were active. If a legacy shell process or its LaunchAgent remains running, the screen can still lock even when using modern browser portals.
3. **Outdated Enrollment Credentials**: Stale `agent.json` or `client.json` files from prior practice contests prevent enrolling into a newly hosted contest.

---

#### Method 1: Automatic Reset via CLI (`--reset`)

The desktop binary includes an automated reset routine that cleanly shuts down running loopback instances, removes operating system autostart entries, and deletes all cached configuration files.

**macOS:**
```bash
# Standalone agent:
"/Applications/Algothon Agent.app/Contents/MacOS/algothon-agent" --reset

# Unified competitor bundle:
"/Applications/mini-algothon-competitor.app/Contents/MacOS/mini-algothon-competitor" --reset
```

**Windows (PowerShell):**
```powershell
& "$env:ProgramFiles\Algothon\algothon-agent.exe" --reset
# Or if running portable binary:
.\algothon-agent.exe --reset
```

**Linux:**
```bash
./algothon-agent --reset
```

**Development Environment:**
```bash
make agent-reset    # Resets standalone agent configuration
make desktop-reset  # Resets legacy competitor client configuration
```

---

#### Method 2: GUI Tray Reset

If the application icon is visible in the macOS menu bar or Windows system tray:
1. Click or right-click the Algothon shield tray icon.
2. Select **Reset all client data and quit…**.
3. Confirm the dialog prompt. The agent notifies the backend of a clean shutdown, deletes local credentials, unregisters autostart entries, and terminates.

---

#### Method 3: Complete Manual Clean-Up

Use manual removal if an old installation cannot launch or if orphaned processes refuse to terminate:

##### macOS Manual Removal

1. **Terminate running processes**:
   ```bash
   killall algothon-agent algothon-competitor mini-algothon-competitor 2>/dev/null || true
   ```

2. **Unload and delete LaunchAgents** (prevents background auto-starting on login):
   ```bash
   launchctl unload ~/Library/LaunchAgents/*algothon*.plist 2>/dev/null || true
   rm -f ~/Library/LaunchAgents/*algothon*.plist ~/Library/LaunchAgents/*minialgothon*.plist
   ```

3. **Delete saved tokens and application configuration**:
   ```bash
   rm -rf ~/Library/Application\ Support/com.algothon.agent \
          ~/Library/Application\ Support/com.algothon.competitor \
          ~/Library/Application\ Support/com.minialgothon.competitor
   ```

4. **Delete legacy app bundles**:
   ```bash
   rm -rf "/Applications/mini-algothon-competitor.app" \
          "/Applications/Algothon Competitor.app"
   ```

5. **Verify the loopback port is released**:
   ```bash
   lsof -i :47615
   ```
   If nothing is returned, the port is free for the new agent.

##### Windows Manual Removal (PowerShell)

1. **Terminate running processes**:
   ```powershell
   Stop-Process -Name "algothon-agent", "algothon-competitor", "mini-algothon-competitor" -Force -ErrorAction SilentlyContinue
   ```

2. **Remove Startup shortcuts**:
   ```powershell
   Remove-Item "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\*algothon*.lnk" -ErrorAction SilentlyContinue
   ```

3. **Delete configuration and credential caches**:
   ```powershell
   Remove-Item -Recurse -Force "$env:APPDATA\com.algothon.agent" -ErrorAction SilentlyContinue
   Remove-Item -Recurse -Force "$env:APPDATA\com.algothon.competitor" -ErrorAction SilentlyContinue
   Remove-Item -Recurse -Force "$env:APPDATA\com.minialgothon.competitor" -ErrorAction SilentlyContinue
   ```

4. **Verify the loopback port is released**:
   ```powershell
   Get-NetTCPConnection -LocalPort 47615 -ErrorAction SilentlyContinue
   ```

##### Linux Manual Removal

1. **Terminate running processes**:
   ```bash
   pkill -f algothon-agent || true
   pkill -f algothon-competitor || true
   ```

2. **Remove autostart entries**:
   ```bash
   rm -f ~/.config/autostart/*algothon*.desktop
   ```

3. **Delete configuration folders**:
   ```bash
   rm -rf ~/.config/com.algothon.agent \
          ~/.config/com.algothon.competitor \
          ~/.config/com.minialgothon.competitor
   ```

4. **Verify the loopback port is released**:
   ```bash
   ss -tulpn | grep 47615
   ```

---

## 2. Client Architecture

One binary, two processes, selected by argument:

| Mode | Command | Role |
| --- | --- | --- |
| Proctor agent | `mini-algothon-competitor --agent` | Holds its own enrolled credential, collects endpoint signals, heartbeats every 15s, serves loopback attestation, owns the tray. Autostarts at login. |
| Contest shell | `mini-algothon-competitor` | A webview pointed at the server-hosted portal. Holds no credential and makes no proctoring decision. |

The split is the point: **the shell can crash, hang, or ship a bad portal deploy without
affecting a contestant's ability to submit**, because liveness lives in a process the UI cannot
take down. If the shell is unusable, the contestant opens the same portal in a browser and keeps
working — the agent is still reporting, so the submission gate stays open.

- The agent's loopback bind (`127.0.0.1:47615`, falling back through `47619`) doubles as its
  single-instance lock. The shell uses `47620` the same way, and answers `/show` on it so the
  tray raises an existing window instead of opening a second one over unsaved work.
- The shell posts to the agent every 10s. Three consecutive failures and it relaunches the agent.
- Contestants use their own IDE and their own compilers. Nothing is bundled: no Node, no
  Next.js server, no toolchains.

### Why a window is never blank

Three separate causes produced a white screen in the first build of this split, all of them now
closed:

- **`app.withGlobalTauri` must be `true`.** It defaults to *false* in Tauri v2, so
  `window.__TAURI__` is never injected and the plain-HTML setup and diagnostics pages died on their
  first line. `setup/bridge.js` now resolves `__TAURI__` *or* `__TAURI_INTERNALS__` and, if neither
  exists, prints what to do instead of leaving the page inert.
- **First run must not spawn-and-exit.** With nothing configured the shell used to launch a detached
  agent and quit, which is indistinguishable from a crash. `main.rs` now routes an unconfigured or
  unenrolled client straight into the agent process, which owns setup.
- **An unreachable portal must not be a blank webview.** The shell probes the portal before creating
  the window and falls back to a local page naming the address, the reason, a Retry, and a route back
  to setup. It re-probes every ten seconds and switches to the portal the moment the server answers.

## 3. First run, and everyday use

1. Launch the app. With nothing configured, it opens the **setup window**.
2. Enter the portal and API addresses for this contest.
3. Read the proctoring disclosure, which is fetched from the server rather than compiled in.
   Accept or quit.
4. Sign in once. This enrols the agent on this machine and writes a token to
   `agent.json` (mode `0600`); the contestant never signs in here again.

After that the agent starts at login and stays in the tray for the whole contest. The tray menu
carries the live status, **Open contest window**, **Diagnostics…**, the support code, and
**Stop proctoring…**.

Stopping is always allowed and never silent: it asks for confirmation, states that scored
submissions will lock, and reports a clean shutdown to the server so the blackout is not
recorded as evasion. Testing code with Run keeps working either way.

**Diagnostics** is the contest-day support tool. It shows agent version, uptime, seconds since
the last acknowledged report, buffered heartbeat count, current signals, and the last twenty
reports, with one **Copy diagnostics** button. The support code (`USER-MACHINE-BOOT`) resolves a
contestant to a row in the admin monitoring view without anyone spelling a UUID across a hall.

## 4. Building the Client

```bash
make desktop-build
```

Output:

```text
competitor-desktop/src-tauri/target/release/bundle/macos/mini-algothon-competitor.app
```

Build a universal bundle so one artifact covers Intel and Apple Silicon:

```bash
rustup target add x86_64-apple-darwin aarch64-apple-darwin
cd competitor-desktop && pnpm tauri build --target universal-apple-darwin
```

**The portal and API addresses are baked in at build time.** They are read by `option_env!`, so
they must be set when cargo runs:

```bash
MINIALGOTHON_SERVER_URL=https://portal.example \
MINIALGOTHON_API_URL=https://api.example \
MINIALGOTHON_PORTAL_ORIGINS=http://10.0.0.5 \
  make desktop-build
```

| Variable | What it is |
| --- | --- |
| `MINIALGOTHON_SERVER_URL` | The portal this client opens, and the Origin its loopback server answers |
| `MINIALGOTHON_API_URL` | Where the agent reports. On a LAN with no contestant internet, the venue relay — **not** including `/api`, which the agent appends itself |
| `MINIALGOTHON_PORTAL_ORIGINS` | Standby portals the loopback server also answers, comma-separated. What makes a failover portal usable without reinstalling across a hall |

Baking them in is deliberate. The address a contestant types becomes the only Origin the loopback
server will answer, so one typo costs them attestation and shows a banner blaming an agent that is
running perfectly.

A saved `client.json` still overrides the build, so a contest server can move without reimaging.
Config lives at:

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Application Support/com.minialgothon.competitor/` |
| Windows | `%APPDATA%\com.minialgothon.competitor\` |
| Linux | `~/.config/com.minialgothon.competitor/` |

To pre-seed a lab image, write `client.json` there before first launch:

```json
{ "server_url": "http://contest.local", "api_url": "http://contest.local" }
```

`api_url` is a bare origin. The agent appends `/api/v1/...` to it, so a trailing `/api` produces
`/api/api/v1/agent/enroll` and every report fails.

Each contestant still enrols individually — `agent.json` must never be baked into an image, or
every machine would report as the same person.

## 5. Automated CI/CD GitHub Actions

Multi-platform builds (macOS, Windows, Linux) are automated in
[.github/workflows/build-desktop.yml](../.github/workflows/build-desktop.yml).

1. **Pushing to `main`** builds all three platforms and uploads artifacts to the Actions tab.
2. **Pushing a release tag** (`v*`) publishes a GitHub release:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. **Manual trigger**: Actions → Build Desktop Release Applications → Run workflow.

**Set `MINIALGOTHON_SERVER_URL` and `MINIALGOTHON_API_URL` as repository variables**
(Settings → Secrets and variables → Actions → Variables), or pass them as inputs on a manual run.
The workflow fails fast when they are missing rather than publishing installers that point at
`localhost`. `MINIALGOTHON_PORTAL_ORIGINS` is optional.

An empty value is worse than an absent one — `option_env!` returns `Some("")` for a variable that
is set but blank — which is what that pre-build check exists to catch.
