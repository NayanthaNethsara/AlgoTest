"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  FileSpreadsheetIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Team } from "@/types/team";
import { parseCsvInput } from "./csv-utils";
import type { ParsedCsvRow } from "./types";

type BulkMode = "csv_with_teams" | "single_team";
type TeamType = "existing" | "new";

const MAX_CSV_BYTES = 512 * 1024;

const MODES: { value: BulkMode; title: string; columns: string }[] = [
  {
    value: "csv_with_teams",
    title: "CSV includes a team column",
    columns: "username, [display_name], team_name, [password]",
  },
  {
    value: "single_team",
    title: "Assign every row to one team",
    columns: "username, [display_name], [password]",
  },
];

interface UserBulkDialogProps {
  teams: Team[];
  pending: boolean;
  bulkErrors: { username: string; error: string }[];
  onSubmit: (parsedRows: ParsedCsvRow[]) => Promise<void>;
  onCancel: () => void;
}

export function UserBulkDialog({
  teams,
  pending,
  bulkErrors,
  onSubmit,
  onCancel,
}: UserBulkDialogProps) {
  const [bulkMode, setBulkMode] = useState<BulkMode>("csv_with_teams");
  const [teamType, setTeamType] = useState<TeamType>("existing");
  const [defaultTeamId, setDefaultTeamId] = useState("");
  const [defaultNewTeamName, setDefaultNewTeamName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsedRows: ParsedCsvRow[] = useMemo(() => {
    if (!csvText.trim()) return [];
    return parseCsvInput(
      csvText,
      bulkMode === "single_team",
      teamType === "existing"
        ? teams.find((t) => t.id === defaultTeamId)?.name
        : defaultNewTeamName.trim()
    );
  }, [csvText, bulkMode, defaultTeamId, defaultNewTeamName, teamType, teams]);

  const validRows = parsedRows.filter((r) => r.isValid);
  const invalidCount = parsedRows.length - validRows.length;

  async function handleFile(file: File) {
    if (file.size > MAX_CSV_BYTES) {
      toast.error("File too large", { description: "Keep the roster under 512 KB." });
      return;
    }
    setCsvText(await file.text());
    setLocalError(null);
  }

  async function handleSubmit() {
    setLocalError(null);
    if (parsedRows.length === 0) {
      setLocalError("Paste rows or upload a CSV file first.");
      return;
    }
    if (validRows.length === 0) {
      setLocalError("No valid rows — every row needs a username and a team.");
      return;
    }
    await onSubmit(validRows);
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileSpreadsheetIcon className="size-4 text-primary" /> Bulk import competitors
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Teams that do not exist yet are created automatically.
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
            <AlertTitle>{bulkErrors.length} row(s) failed during creation</AlertTitle>
            <AlertDescription>
              <ul className="max-h-24 space-y-0.5 overflow-y-auto font-mono text-[11px]">
                {bulkErrors.map((err) => (
                  <li key={err.username}>
                    {err.username}: {err.error}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Import mode</legend>
          {MODES.map((mode) => {
            const selected = bulkMode === mode.value;
            return (
              <label
                key={mode.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  selected ? "border-primary bg-primary/5" : "bg-muted/10 hover:bg-muted/30"
                )}
              >
                <input
                  type="radio"
                  name="bulkMode"
                  value={mode.value}
                  checked={selected}
                  onChange={() => setBulkMode(mode.value)}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  <span className="block text-xs font-semibold">{mode.title}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    {mode.columns}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {bulkMode === "single_team" && (
          <Field className="rounded-lg border bg-muted/10 p-3">
            <FieldLabel>Target team for every row</FieldLabel>
            <Tabs value={teamType} onValueChange={(v) => setTeamType(v as TeamType)}>
              <TabsList className="h-8 w-full">
                <TabsTrigger
                  value="existing"
                  disabled={teams.length === 0}
                  className="h-7 flex-1 text-xs"
                >
                  Existing team
                </TabsTrigger>
                <TabsTrigger value="new" className="h-7 flex-1 text-xs">
                  New team
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {teamType === "existing" ? (
              <SimpleSelect
                value={defaultTeamId}
                onValueChange={setDefaultTeamId}
                options={teams.map((t) => ({ value: t.id, label: t.name }))}
                placeholder="Choose a team…"
                aria-label="Target team"
                className="text-xs"
              />
            ) : (
              <Input
                value={defaultNewTeamName}
                onChange={(e) => setDefaultNewTeamName(e.target.value)}
                placeholder="New team name…"
                aria-label="New team name"
                className="text-xs"
              />
            )}
          </Field>
        )}

        <Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FieldLabel htmlFor="bulk-csv">Paste rows or upload a file</FieldLabel>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[11px] text-muted-foreground">
                {bulkMode === "csv_with_teams"
                  ? "username, [display_name], team_name, [password]"
                  : "username, [display_name], [password]"}
              </span>
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
                className="gap-1"
              >
                <UploadIcon /> Upload CSV
              </Button>
            </div>
          </div>
          <Textarea
            id="bulk-csv"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder={
              bulkMode === "csv_with_teams"
                ? "alice, Alice Walker, Team Alpha, secret123\nbob, Bob Smith, Team Beta"
                : "alice, Alice Walker, secret123\nbob, Bob Smith"
            }
            className="font-mono text-xs"
          />
          <FieldDescription>
            A header row is optional. Comma- or tab-separated values both work.
          </FieldDescription>
        </Field>

        {parsedRows.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/10 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span>Preview ({parsedRows.length} rows)</span>
              <Badge variant="outline" className="gap-1 text-[10px]">
                <CheckCircle2Icon className="size-3 text-success" /> {validRows.length} valid
              </Badge>
              {invalidCount > 0 && (
                <Badge variant="destructive" className="gap-1 text-[10px]">
                  <AlertCircleIcon className="size-3" /> {invalidCount} invalid
                </Badge>
              )}
            </div>

            <div className="max-h-48 overflow-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-7 text-[11px]">Status</TableHead>
                    <TableHead className="h-7 text-[11px]">Username</TableHead>
                    <TableHead className="h-7 text-[11px]">Display name</TableHead>
                    <TableHead className="h-7 text-[11px]">Team</TableHead>
                    <TableHead className="h-7 text-[11px]">Password</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row, idx) => (
                    <TableRow
                      key={`${row.username}-${idx}`}
                      className={cn(!row.isValid && "bg-destructive/5")}
                    >
                      <TableCell className="py-1 text-[11px]">
                        {row.isValid ? (
                          <span className="font-semibold text-success">OK</span>
                        ) : (
                          <span className="font-medium text-destructive">
                            {row.validationError}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-1 font-mono text-xs">
                        {row.username || "—"}
                      </TableCell>
                      <TableCell className="py-1 text-xs">{row.displayName || "—"}</TableCell>
                      <TableCell className="py-1 text-xs font-medium">
                        {row.teamName || <span className="text-destructive">None</span>}
                      </TableCell>
                      <TableCell className="py-1 font-mono text-xs text-muted-foreground">
                        {row.password ? "Provided" : "Auto-gen"}
                      </TableCell>
                    </TableRow>
                  ))}
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
            disabled={pending || validRows.length === 0}
            className="gap-1.5"
          >
            {pending ? <Spinner /> : <UploadIcon />}
            {pending ? "Importing…" : `Import ${validRows.length} competitor(s)`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
