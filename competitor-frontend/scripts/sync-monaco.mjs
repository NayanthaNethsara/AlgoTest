// Copies Monaco's min/vs into public/monaco/vs. Without it the editor is fetched
// from cdn.jsdelivr.net at runtime, which on a contest LAN is a blank editor.
// Called from `dev` and `build` rather than a pnpm pre-script, because
// enable-pre-post-scripts defaults to false.

import { createRequire } from "node:module";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const monacoRoot = path.dirname(require.resolve("monaco-editor/package.json"));
const { version } = JSON.parse(
  await readFile(path.join(monacoRoot, "package.json"), "utf8"),
);

const destRoot = path.join(import.meta.dirname, "..", "public", "monaco");
const stamp = path.join(destRoot, ".version");

if ((await readFile(stamp, "utf8").catch(() => null)) === version) {
  process.exit(0);
}

await rm(destRoot, { recursive: true, force: true });
await mkdir(destRoot, { recursive: true });
await cp(path.join(monacoRoot, "min", "vs"), path.join(destRoot, "vs"), {
  recursive: true,
});
await writeFile(stamp, version);

console.log(`monaco ${version} -> public/monaco/vs`);
