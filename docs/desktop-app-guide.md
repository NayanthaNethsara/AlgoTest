# Competitor Desktop Application Guide

This guide covers installation, Gatekeeper troubleshooting, building, and deployment for the
**MiniAlgothon Competitor Client** (Tauri v2 + Rust). See
[client-design.md](client-design.md) for why it is built the way it is.

---

## 1. Installation & Troubleshooting Guide

### macOS Installation

When downloading the `.app` bundle from GitHub or the web on macOS, Gatekeeper flags un-signed executables with a security quarantine attribute.

#### Issue: "App is damaged and can't be opened"
When attempting to launch the application for the first time, macOS may present the error:
> *"mini-algothon-competitor" is damaged and can’t be opened. You should move it to the Trash.*

#### Cause
macOS automatically assigns the `com.apple.quarantine` extended attribute to files downloaded from web browsers. Since the application binary is self-signed without an Apple Developer ID subscription, Gatekeeper blocks execution by default.

#### Solution 1: Terminal Command (Recommended)
Open Terminal and remove the quarantine attribute:

```bash
xattr -cr /path/to/mini-algothon-competitor.app
```

*Example:*
```bash
xattr -cr ~/Downloads/mini-algothon-competitor.app
```

After running this command, launch the app normally by double-clicking.

#### Solution 2: Right-Click Bypass (GUI)
1. In Finder, **Control-click** (or Right-click) the `mini-algothon-competitor.app` icon.
2. Select **Open** from the context menu.
3. Click **Open** in the security confirmation dialog.

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

**There is no build-time server URL.** The portal and API addresses are runtime configuration in
`client.json`, so one binary works for every contest and the server can move without reimaging
laptops. Config lives at:

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Application Support/com.minialgothon.competitor/` |
| Windows | `%APPDATA%\com.minialgothon.competitor\` |
| Linux | `~/.config/com.minialgothon.competitor/` |

To pre-seed a lab image, write `client.json` there before first launch:

```json
{ "server_url": "http://contest.local", "api_url": "http://contest.local/api" }
```

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

No repository variables are needed. The old `NEXT_PUBLIC_API_URL` build variable is gone with
the runtime configuration.
