export function formatClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const KNOWN_APP_NAMES: Record<string, string> = {
  "com.google.antigravity-ide": "Antigravity IDE",
  "com.google.antigravity": "Antigravity IDE",
  "antigravity-ide": "Antigravity IDE",
  "antigravity": "Antigravity IDE",
  "com.microsoft.vscode": "VS Code",
  "com.microsoft.vscodeinsiders": "VS Code Insiders",
  "vscode": "VS Code",
  "code": "VS Code",
  "com.google.chrome": "Google Chrome",
  "chrome": "Google Chrome",
  "google-chrome": "Google Chrome",
  "org.mozilla.firefox": "Firefox",
  "firefox": "Firefox",
  "com.apple.safari": "Safari",
  "safari": "Safari",
  "com.anysphere.cursor": "Cursor",
  "cursor": "Cursor",
  "com.exafunction.windsurf": "Windsurf",
  "windsurf": "Windsurf",
  "com.openai.chat": "ChatGPT",
  "chatgpt": "ChatGPT",
  "com.anthropic.claude": "Claude",
  "claude": "Claude",
  "com.apple.terminal": "Terminal",
  "terminal": "Terminal",
  "com.googlecode.iterm2": "iTerm2",
  "iterm2": "iTerm2",
  "iterm": "iTerm2",
  "com.apple.finder": "Finder",
  "finder": "Finder",
  "github.copilot": "GitHub Copilot",
  "copilot": "GitHub Copilot",
  "copilot-agent": "GitHub Copilot Agent",
  "copilot-language-server": "GitHub Copilot LSP",
  "ollama": "Ollama",
  "lmstudio": "LM Studio",
  "lm studio": "LM Studio",
  "aider": "Aider AI",
};

export function formatAppName(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (KNOWN_APP_NAMES[lower]) return KNOWN_APP_NAMES[lower];

  let cleaned = trimmed;
  if (cleaned.includes("/") || cleaned.includes("\\")) {
    const parts = cleaned.split(/[/\\]/);
    cleaned = parts[parts.length - 1] || cleaned;
  }
  if (cleaned.toLowerCase().endsWith(".app") || cleaned.toLowerCase().endsWith(".exe")) {
    cleaned = cleaned.slice(0, -4);
  }
  if (cleaned.includes(".")) {
    const parts = cleaned.split(".");
    cleaned = parts[parts.length - 1] || cleaned;
  }
  if (KNOWN_APP_NAMES[cleaned.toLowerCase()]) {
    return KNOWN_APP_NAMES[cleaned.toLowerCase()];
  }
  return cleaned;
}

export function formatRuleTitle(ruleId: string, fallback?: string): string {
  const titles: Record<string, string> = {
    "web.fullscreen_exit": "Browser Exited Fullscreen",
    "web.window_blur": "Window Focus Lost (App Switch)",
    "web.tab_switch": "Browser Tab Switched / Hidden",
    "web.devtools_attempt": "Developer Tools / Inspection Attempt",
    "web.lockout_exceeded": "Browser Lockout Violations Exceeded",
    "ai.proc.denylist": "Restricted AI Process Running",
    "ai.fg.denylist": "Restricted Application in Focus",
    "app.unauthorized_foreground": "Unauthorized Application in Foreground",
    "net.internet": "Public Internet Route Reachable",
  };
  return titles[ruleId] || fallback || ruleId;
}

