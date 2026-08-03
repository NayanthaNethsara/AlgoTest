#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, lstatSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const src = join(root, "competitor-desktop", "src-tauri", "server");
const dest = join(
  root,
  "competitor-desktop",
  "src-tauri",
  "target",
  "release",
  "bundle",
  "macos",
  "mini-algothon-competitor.app",
  "Contents",
  "MacOS",
  "server"
);

if (!existsSync(src)) {
  console.error("Server directory not found:", src);
  process.exit(1);
}

if (existsSync(dest)) {
  rmSync(dest, { recursive: true, force: true });
}
mkdirSync(dest, { recursive: true });

function safeFilter(source) {
  try {
    if (lstatSync(source).isSymbolicLink() && !existsSync(source)) {
      return false;
    }
  } catch {
    return false;
  }
  return true;
}

cpSync(src, dest, { recursive: true, filter: safeFilter, verbatimSymlinks: false });
console.log("Copied server bundle into .app successfully!");
