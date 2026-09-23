export type DesktopBuildOs = "windows" | "macos" | "linux";

export interface DesktopBuild {
  os: DesktopBuildOs;
  label: string;
  file: string;
  sizeLabel: string;
  sha256: string;
  installNote: string;
  gateNote: string;
}

export const DESKTOP_BUILDS: DesktopBuild[] = [
  {
    os: "windows",
    label: "Windows",
    file: "release-windows.zip",
    sizeLabel: "3.0 MB",
    sha256:
      "0f6cca17814e54cff4f9816dee9db99f5ac45cd8599f8d8af1b9ab769702faba",
    installNote: "Unzip, then run the installer inside.",
    gateNote:
      'SmartScreen will say "Windows protected your PC" because the build isn\'t code-signed yet — click "More info" → "Run anyway".',
  },
  {
    os: "macos",
    label: "macOS",
    file: "labyrithm-agent-macos.zip",
    sizeLabel: "3.2 MB",
    sha256:
      "f00055d1b1c3c0a34cd46ac77c9d5a392d2b825a324fdc6a7c7d6d29dae0e4c8",
    installNote: "Unzip, then drag the app into Applications.",
    gateNote:
      'Gatekeeper will block the first launch since the app isn\'t notarized. Close that message, then go to System Settings → Privacy & Security, scroll to the Security section, and click "Open Anyway" — then open the app once more to confirm.',
  },
  {
    os: "linux",
    label: "Linux",
    file: "release-linux.zip",
    sizeLabel: "2.8 MB",
    sha256:
      "15736e7bc8c24c86c544081d133e781ed7140da97a38a5678ce27877912f7e07",
    installNote: "Unzip, then run the AppImage or install the .deb inside.",
    gateNote: "Mark the AppImage executable first: chmod +x ./*.AppImage",
  },
];

export function detectOs(): DesktopBuildOs | null {
  if (typeof navigator === "undefined") return null;
  const platform = `${navigator.userAgent} ${navigator.platform ?? ""}`.toLowerCase();
  if (platform.includes("win")) return "windows";
  if (platform.includes("mac")) return "macos";
  if (platform.includes("linux") || platform.includes("x11")) return "linux";
  return null;
}
