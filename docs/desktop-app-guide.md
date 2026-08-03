# Competitor Desktop Application Guide

This guide covers installation, Gatekeeper troubleshooting, building, and deployment for the **MiniAlgothon Competitor Desktop Application** (built with Tauri v2 and Next.js).

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

## 2. Desktop App Architecture

The desktop application uses a **Zero-Dependency Bundled Standalone Architecture**:

- **Native Windowing**: Tauri v2 (WebKit/Rust) native desktop shell.
- **Embedded Server**: Bundles Next.js `.next/standalone` output into `Contents/MacOS/server/`.
- **Embedded Node.js**: Includes a standalone Node.js binary in `server/bin/node` so competitors do not need Node pre-installed on their machines.
- **Process Lifecycle**: Tauri automatically spawns the background server on startup and cleans up child processes on app termination.

---

## 3. Building the Desktop Application

### Local Build Command

Build the desktop application bundle locally:

```bash
make desktop-build
```

The output application will be generated at:
```text
competitor-desktop/src-tauri/target/release/bundle/macos/mini-algothon-competitor.app
```

### Building for a Custom Production / Contest Server

To configure the desktop app to connect to your live competition backend API (e.g. `https://api.algothon.example.com` or local server IP `http://192.168.1.100:8080`), set the `NEXT_PUBLIC_API_URL` environment variable during build:

```bash
NEXT_PUBLIC_API_URL="https://api.algothon.example.com" make desktop-build
```

---

## 4. Automated CI/CD GitHub Actions

Multi-platform builds (macOS, Windows, Linux) are fully automated via GitHub Actions in [.github/workflows/build-desktop.yml](file:///.github/workflows/build-desktop.yml).

### Automatic Triggers:
1. **Pushing to `main`**: Builds all 3 platform packages automatically and uploads build artifacts to the GitHub Actions tab.
2. **Pushing a Release Tag** (`v*`):
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
   Automatically builds all 3 OS packages and creates a published release on the GitHub Releases page.
3. **Manual Trigger**: Go to **GitHub Repo -> Actions -> Build Desktop Release Applications -> Run workflow**.

### Configuring Production Backend URL in GitHub:
Go to **GitHub Repository Settings -> Secrets and variables -> Actions -> Variables** and add:
- `NEXT_PUBLIC_API_URL`: `https://api.algothon.example.com`
