import { downloadTextFile } from "@/lib/file-utils";
import { splitDelimitedLine } from "@/lib/csv-utils";
import type { ParsedCsvRow } from "./types";

export { splitDelimitedLine };

export function getUserSampleCsvContent(isSingleTeamMode: boolean): string {
  if (isSingleTeamMode) {
    return [
      "username,display_name,password",
      "alice_walker,Alice Walker,",
      "bob_smith,Bob Smith,TempPass123",
      "charlie_brown,Charlie Brown,",
    ].join("\n");
  }

  return [
    "username,display_name,team_name,password",
    "alice_walker,Alice Walker,Team Alpha,",
    "bob_smith,Bob Smith,Team Alpha,TempPass123",
    "charlie_brown,Charlie Brown,Team Beta,",
    "david_clark,David Clark,Team Beta,SecretPass456",
  ].join("\n");
}

export function downloadUserSampleCsv(isSingleTeamMode: boolean): void {
  const content = getUserSampleCsvContent(isSingleTeamMode);
  const filename = isSingleTeamMode
    ? "competitors_single_team_template.csv"
    : "competitors_with_teams_template.csv";
  downloadTextFile(filename, content, "text/csv;charset=utf-8;");
}

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

  const firstLine = lines[0].toLowerCase();
  const hasHeader =
    firstLine.includes("username") ||
    firstLine.includes("team") ||
    firstLine.includes("display_name") ||
    firstLine.includes("name");

  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line) => {
    const parts = splitDelimitedLine(line);

    let username = "";
    let displayName: string | undefined;
    let teamName: string | undefined;
    let password: string | undefined;

    if (isSingleTeamMode) {
      username = parts[0] || "";
      displayName = parts[1] || undefined;
      password = parts[2] || undefined;
      teamName = singleTeamName || undefined;
    } else {
      if (parts.length >= 4) {
        username = parts[0] || "";
        displayName = parts[1] || undefined;
        teamName = parts[2] || undefined;
        password = parts[3] || undefined;
      } else if (parts.length === 3) {
        username = parts[0] || "";
        displayName = parts[1] || undefined;
        teamName = parts[2] || undefined;
      } else if (parts.length === 2) {
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

