#!/usr/bin/env node

// Copies the Next.js standalone server output into the Tauri src-tauri
// directory, including a standalone Node.js executable. Automatically
// downloads Node binary if not present.

import { cpSync, mkdirSync, existsSync, rmSync, lstatSync, chmodSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const standaloneDir = join(root, "competitor-frontend", ".next", "standalone");
const staticDir = join(root, "competitor-frontend", ".next", "static");
const publicDir = join(root, "competitor-frontend", "public");

const targetDir = join(root, "competitor-desktop", "src-tauri", "server");

if (!existsSync(standaloneDir)) {
  console.error("ERROR: standalone build not found at", standaloneDir);
  console.error("Run 'pnpm --filter competitor-frontend build' first.");
  process.exit(1);
}

// Clean previous bundle
if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true });
}

function safeFilter(src) {
  try {
    if (lstatSync(src).isSymbolicLink() && !existsSync(src)) {
      return false;
    }
  } catch {
    return false;
  }
  return true;
}

console.log("Copying standalone server...");
mkdirSync(targetDir, { recursive: true });
cpSync(standaloneDir, targetDir, { recursive: true, filter: safeFilter });

// Copy static assets into the standalone output
const staticTarget = join(targetDir, "competitor-frontend", ".next", "static");
if (existsSync(staticDir)) {
  console.log("Copying static assets...");
  mkdirSync(staticTarget, { recursive: true });
  cpSync(staticDir, staticTarget, { recursive: true, filter: safeFilter });
}

// Copy public assets
const publicTarget = join(targetDir, "competitor-frontend", "public");
if (existsSync(publicDir)) {
  console.log("Copying public assets...");
  mkdirSync(publicTarget, { recursive: true });
  cpSync(publicDir, publicTarget, { recursive: true, filter: safeFilter });
}

// Copy standalone Node.js executable into server/bin for zero-dependency execution
const binDir = join(targetDir, "bin");
mkdirSync(binDir, { recursive: true });
const isWin = process.platform === "win32";
const targetNode = join(binDir, isWin ? "node.exe" : "node");

if (existsSync(process.execPath)) {
  console.log("Bundling Node binary from", process.execPath, "to", targetNode);
  cpSync(process.execPath, targetNode);
} else {
  console.log("Downloading official Node binary for target platform...");
  const url = isWin
    ? "https://nodejs.org/dist/v20.18.0/win-x64/node.exe"
    : "https://nodejs.org/dist/v20.18.0/node-v20.18.0-darwin-arm64.tar.gz";
  execSync(`curl -sL "${url}" -o "${targetNode}"`);
}

try {
  chmodSync(targetNode, 0o755);
} catch {
  // Ignore on Windows
}

console.log("Server & Node binary bundle ready at:", targetDir);
