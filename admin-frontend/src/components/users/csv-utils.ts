import type { ParsedCsvRow } from "./types";

export function parseCsvInput(
  text: string,
  isSingleTeamMode: boolean,
  singleTeamName?: string
): ParsedCsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  // Check if first line is a header
  const firstLine = lines[0].toLowerCase();
  const hasHeader =
    firstLine.includes("username") ||
    firstLine.includes("team") ||
    firstLine.includes("display_name") ||
    firstLine.includes("name");

  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line) => {
    const parts = line.split(",").map((s) => s.trim());

    let username = "";
    let displayName: string | undefined;
    let teamName: string | undefined;
    let password: string | undefined;

    if (isSingleTeamMode) {
      // Columns: username, displayName, password
      username = parts[0] || "";
      displayName = parts[1] || undefined;
      password = parts[2] || undefined;
      teamName = singleTeamName || undefined;
    } else {
      // Multi-team mode
      if (parts.length >= 4) {
        // username, displayName, teamName, password
        username = parts[0] || "";
        displayName = parts[1] || undefined;
        teamName = parts[2] || undefined;
        password = parts[3] || undefined;
      } else if (parts.length === 3) {
        // username, displayName, teamName
        username = parts[0] || "";
        displayName = parts[1] || undefined;
        teamName = parts[2] || undefined;
      } else if (parts.length === 2) {
        // username, teamName
        username = parts[0] || "";
        teamName = parts[1] || undefined;
      } else {
        username = parts[0] || "";
      }
    }

    const isValid = Boolean(username && teamName);
    let validationError: string | undefined;
    if (!username) {
      validationError = "Missing username";
    } else if (!teamName) {
      validationError = "Missing team name";
    }

    return {
      username,
      displayName: displayName || undefined,
      teamName: teamName || undefined,
      password: password || undefined,
      isValid,
      validationError,
    };
  });
}
