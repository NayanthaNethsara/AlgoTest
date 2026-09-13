"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CopyIcon,
  DownloadIcon,
  FolderPlusIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { downloadTextFile } from "@/lib/file-utils";
import { splitDelimitedLine } from "@/lib/csv-utils";
import type { Team, CreateTeamInput } from "@/types/team";

type BulkTeamMode = "names_only" | "with_members";
type PreviewFilter = "all" | "selected" | "invalid";

const MAX_CSV_BYTES = 512 * 1024;
const MAX_MEMBERS_PER_TEAM = 3;

const MODES: { value: BulkTeamMode; title: string; columns: string }[] = [
  {
    value: "names_only",
    title: "Team names only",
    columns: "team_name (one per line)",
  },
  {
    value: "with_members",
    title: "Teams with members",
    columns: "team_name, username, [display_name], [password]",
  },
];

interface ParsedTeamItem {
  name: string;
  members: Array<{ username: string; displayName?: string; password?: string }>;
  isValid: boolean;
  validationError?: string;
}

interface TeamBulkDialogProps {
  existingTeams: Team[];
  pending: boolean;
  bulkErrors: { name: string; error: string }[];
  onSubmit: (teams: CreateTeamInput[]) => Promise<void>;
  onCancel: () => void;
}

function getTeamSampleCsv(mode: BulkTeamMode): string {
  if (mode === "names_only") {
    return ["team_name", "Team Alpha", "Team Beta", "Team Gamma", "Team Delta"].join("\n");
  }
  return [
    "team_name,username,display_name,password",
    "Team Alpha,alice,Alice Walker,",
    "Team Alpha,bob,Bob Smith,SecretPass123",
    "Team Beta,carol,Carol White,",
    "Team Beta,david,David Clark,",
    "Team Gamma,elena,Elena Rostova,TempPass456",
  ].join("\n");
}

function downloadTeamSampleCsv(mode: BulkTeamMode): void {
  const content = getTeamSampleCsv(mode);
  const filename = mode === "names_only" ? "teams_sample.csv" : "teams_with_members_sample.csv";
  downloadTextFile(filename, content, "text/csv;charset=utf-8;");
}

function parseTeamsInput(
  text: string,
  mode: BulkTeamMode,
  existingTeamNamesSet: Set<string>
): ParsedTeamItem[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const firstLine = lines[0].toLowerCase();
  const hasHeader =
    firstLine.includes("team") ||
    firstLine.includes("name") ||
    firstLine.includes("username");

  const dataLines = hasHeader ? lines.slice(1) : lines;

  if (mode === "names_only") {
    const seenInFile = new Set<string>();
    return dataLines.map((line) => {
      const parts = splitDelimitedLine(line);
      const teamName = (parts[0] || "").trim();

      if (!teamName) {
        return {
          name: "",
          members: [],
          isValid: false,
          validationError: "Empty team name",
        };
      }

      const lowerName = teamName.toLowerCase();
      if (existingTeamNamesSet.has(lowerName)) {
        return {
          name: teamName,
          members: [],
          isValid: false,
          validationError: "Team already exists in contest",
        };
      }

      if (seenInFile.has(lowerName)) {
        return {
          name: teamName,
          members: [],
          isValid: false,
          validationError: "Duplicate team name in file",
        };
      }

      seenInFile.add(lowerName);
      return {
        name: teamName,
        members: [],
        isValid: true,
      };
    });
  }

  // Mode: with_members -> group rows by team name
  const teamOrder: string[] = [];
  const teamMap = new Map<
    string,
    {
      originalName: string;
      members: Array<{ username: string; displayName?: string; password?: string }>;
    }
  >();

  for (const line of dataLines) {
    const parts = splitDelimitedLine(line);
    const rawTeamName = (parts[0] || "").trim();
    if (!rawTeamName) continue;

    const lowerName = rawTeamName.toLowerCase();
    if (!teamMap.has(lowerName)) {
      teamOrder.push(lowerName);
      teamMap.set(lowerName, {
        originalName: rawTeamName,
        members: [],
      });
    }

    const username = (parts[1] || "").trim();
    const displayName = (parts[2] || "").trim() || undefined;
    const password = (parts[3] || "").trim() || undefined;

    if (username) {
      teamMap.get(lowerName)!.members.push({ username, displayName, password });
    }
  }

  return teamOrder.map((lowerKey) => {
    const data = teamMap.get(lowerKey)!;
    const teamName = data.originalName;

    if (existingTeamNamesSet.has(lowerKey)) {
      return {
        name: teamName,
        members: data.members,
        isValid: false,
        validationError: "Team already exists in contest",
      };
    }

    if (data.members.length > MAX_MEMBERS_PER_TEAM) {
      return {
        name: teamName,
        members: data.members,
        isValid: false,
        validationError: `Exceeds max ${MAX_MEMBERS_PER_TEAM} members per team (${data.members.length} found)`,
      };
    }

    return {
      name: teamName,
      members: data.members,
      isValid: true,
    };
  });
}

export function TeamBulkDialog({
  existingTeams,
  pending,
  bulkErrors,
  onSubmit,
  onCancel,
}: TeamBulkDialogProps) {
  const [mode, setMode] = useState<BulkTeamMode>("names_only");
  const [csvText, setCsvText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingTeamNamesSet = useMemo(() => {
    return new Set(existingTeams.map((t) => t.name.trim().toLowerCase()));
  }, [existingTeams]);

  const parsedTeams = useMemo(() => {
    if (!csvText.trim()) return [];
    return parseTeamsInput(csvText, mode, existingTeamNamesSet);
  }, [csvText, mode, existingTeamNamesSet]);

  const validIndices = useMemo(() => {
    const indices: number[] = [];
    parsedTeams.forEach((item, idx) => {
      if (item.isValid) indices.push(idx);
    });
    return indices;
  }, [parsedTeams]);

  useEffect(() => {
    setSelectedIndices(new Set(validIndices));
    setPreviewFilter("all");
  }, [validIndices]);

  const selectedValidTeams = useMemo(() => {
    return parsedTeams.filter((item, idx) => item.isValid && selectedIndices.has(idx));
  }, [parsedTeams, selectedIndices]);

  const invalidCount = parsedTeams.length - validIndices.length;
  const isAllValidSelected =
    validIndices.length > 0 && validIndices.every((idx) => selectedIndices.has(idx));

  function toggleSelectAllValid() {
    if (isAllValidSelected) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(validIndices));
    }
  }

  function toggleRowSelection(index: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  const visibleTeamsWithIndex = useMemo(() => {
    return parsedTeams
      .map((item, index) => ({ item, index }))
      .filter(({ item, index }) => {
        if (previewFilter === "selected") {
          return item.isValid && selectedIndices.has(index);
        }
        if (previewFilter === "invalid") {
          return !item.isValid;
        }
        return true;
      });
  }, [parsedTeams, previewFilter, selectedIndices]);

  async function handleFile(file: File) {
    if (file.size > MAX_CSV_BYTES) {
      toast.error("File too large", { description: "Keep the file under 512 KB." });
      return;
    }
    setCsvText(await file.text());
    setLocalError(null);
  }

  function handleCopyTemplate() {
    const content = getTeamSampleCsv(mode);
    navigator.clipboard.writeText(content);
    toast.success("Sample template copied to clipboard");
  }

  function handleDownloadSample() {
    downloadTeamSampleCsv(mode);
    toast.success("Sample template downloaded");
  }

  async function handleSubmit() {
    setLocalError(null);
    if (parsedTeams.length === 0) {
      setLocalError("Paste rows or upload a CSV file first.");
      return;
    }
    if (selectedValidTeams.length === 0) {
      setLocalError("Select at least one valid team to import.");
      return;
    }

    const payload: CreateTeamInput[] = selectedValidTeams.map((t) => ({
      name: t.name,
      members: t.members.length > 0 ? t.members : undefined,
    }));

    await onSubmit(payload);
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FolderPlusIcon className="size-4 text-primary" /> Bulk import teams
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Import multiple teams at once. Member accounts will be created and linked automatically.
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCancel}
          disabled={pending}
          aria-label="Close bulk import"
          className="col-start-2 row-start-1 self-start justify-self-end"
        >
          <XIcon />
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {localError && (
          <Alert variant="destructive" role="alert">
            <AlertCircleIcon />
            <AlertDescription>{localError}</AlertDescription>
          </Alert>
        )}

        {bulkErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>{bulkErrors.length} team(s) failed during creation</AlertTitle>
            <AlertDescription>
              <ul className="max-h-24 space-y-0.5 overflow-y-auto font-mono text-[11px]">
                {bulkErrors.map((err) => (
                  <li key={err.name}>
                    {err.name}: {err.error}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Import mode</legend>
          {MODES.map((m) => {
            const selected = mode === m.value;
            return (
              <label
                key={m.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  selected ? "border-primary bg-primary/5" : "bg-muted/10 hover:bg-muted/30"
                )}
              >
                <input
                  type="radio"
                  name="teamBulkMode"
                  value={m.value}
                  checked={selected}
                  onChange={() => setMode(m.value)}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  <span className="block text-xs font-semibold">{m.title}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    {m.columns}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FieldLabel htmlFor="bulk-team-csv">Paste rows or upload a file</FieldLabel>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={handleCopyTemplate}
                className="gap-1 text-[11px]"
              >
                <CopyIcon className="size-3" /> Copy template
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={handleDownloadSample}
                className="gap-1 text-[11px]"
              >
                <DownloadIcon className="size-3" /> Download sample CSV
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1 text-[11px]"
              >
                <UploadIcon className="size-3" /> Upload CSV
              </Button>
            </div>
          </div>
          <Textarea
            id="bulk-team-csv"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder={
              mode === "names_only"
                ? "Team Alpha\nTeam Beta\nTeam Gamma"
                : "Team Alpha, alice, Alice Walker\nTeam Alpha, bob, Bob Smith\nTeam Beta, charlie, Charlie Brown"
            }
            className="font-mono text-xs"
          />
          <FieldDescription>
            {mode === "names_only"
              ? "One team name per line or comma-separated column."
              : "Multiple rows with the same team name are grouped together (up to 3 members per team)."}
          </FieldDescription>
        </Field>

        {parsedTeams.length > 0 && (
          <div className="flex flex-col gap-2.5 rounded-lg border bg-muted/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span>Preview ({parsedTeams.length} teams)</span>
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <CheckCircle2Icon className="size-3 text-success" /> {selectedValidTeams.length} of {validIndices.length} selected
                </Badge>
                {invalidCount > 0 && (
                  <Badge variant="destructive" className="gap-1 text-[10px]">
                    <AlertCircleIcon className="size-3" /> {invalidCount} invalid
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant={previewFilter === "all" ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => setPreviewFilter("all")}
                  className="h-6 text-[11px]"
                >
                  All ({parsedTeams.length})
                </Button>
                <Button
                  type="button"
                  variant={previewFilter === "selected" ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => setPreviewFilter("selected")}
                  className="h-6 text-[11px]"
                >
                  Selected ({selectedValidTeams.length})
                </Button>
                {invalidCount > 0 && (
                  <Button
                    type="button"
                    variant={previewFilter === "invalid" ? "secondary" : "ghost"}
                    size="xs"
                    onClick={() => setPreviewFilter("invalid")}
                    className="h-6 text-[11px]"
                  >
                    Invalid ({invalidCount})
                  </Button>
                )}
              </div>
            </div>

            <div className="max-h-56 overflow-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllValidSelected}
                        onChange={toggleSelectAllValid}
                        disabled={validIndices.length === 0}
                        aria-label="Select all valid teams"
                        className="accent-primary"
                      />
                    </TableHead>
                    <TableHead className="h-7 text-[11px]">Status</TableHead>
                    <TableHead className="h-7 text-[11px]">Team Name</TableHead>
                    <TableHead className="h-7 text-[11px]">Members</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleTeamsWithIndex.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-4 text-center text-xs text-muted-foreground">
                        No teams match the active filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleTeamsWithIndex.map(({ item, index }) => {
                      const isSelected = item.isValid && selectedIndices.has(index);
                      return (
                        <TableRow
                          key={`${item.name}-${index}`}
                          className={cn(
                            !item.isValid && "bg-destructive/5",
                            isSelected && "bg-primary/5"
                          )}
                        >
                          <TableCell className="py-1 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!item.isValid}
                              onChange={() => toggleRowSelection(index)}
                              aria-label={`Select team ${item.name}`}
                              className="accent-primary disabled:opacity-30"
                            />
                          </TableCell>
                          <TableCell className="py-1 text-[11px]">
                            {item.isValid ? (
                              <span className="font-semibold text-success">Valid</span>
                            ) : (
                              <span className="font-medium text-destructive">
                                {item.validationError}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-1 text-xs font-semibold">
                            {item.name || "—"}
                          </TableCell>
                          <TableCell className="py-1 text-xs">
                            {item.members.length === 0 ? (
                              <span className="text-muted-foreground">No members</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {item.members.map((m) => (
                                  <Badge
                                    key={m.username}
                                    variant="secondary"
                                    className="font-mono text-[10px]"
                                  >
                                    {m.username}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={pending || selectedValidTeams.length === 0}
            className="gap-1.5"
          >
            {pending ? <Spinner /> : <FolderPlusIcon className="size-4" />}
            {pending ? "Importing…" : `Import ${selectedValidTeams.length} team(s)`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
