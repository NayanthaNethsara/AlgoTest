export const CONFIG = {
  // Platform mode: 'web' (default) or 'desktop' (Tauri)
  PLATFORM: process.env.NEXT_PUBLIC_PLATFORM || "web",
  // Local runner URL used when running in desktop mode with packed compilers
  LOCAL_RUNNER_URL: process.env.NEXT_PUBLIC_LOCAL_RUNNER_URL || "http://127.0.0.1:8081",
  // Central contest API URL (Server-only)
  API_URL: process.env.API_URL || "http://localhost:8080",
};
