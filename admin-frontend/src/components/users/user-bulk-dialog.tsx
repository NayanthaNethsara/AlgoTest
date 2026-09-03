import { useState, useMemo } from "react";
import { Upload, AlertCircle, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import type { Team } from "@/types/team";
import { parseCsvInput } from "./csv-utils";
import type { ParsedCsvRow } from "./types";

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
  const [bulkMode, setBulkMode] = useState<"csv_with_teams" | "single_team">("csv_with_teams");
  const [bulkDefaultTeamId, setBulkDefaultTeamId] = useState("");
  const [bulkDefaultNewTeamName, setBulkDefaultNewTeamName] = useState("");
  const [bulkDefaultTeamType, setBulkDefaultTeamType] = useState<"existing" | "new">("existing");
  const [csvText, setCsvText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const parsedRows: ParsedCsvRow[] = useMemo(() => {
    if (!csvText.trim()) return [];
    return parseCsvInput(
      csvText,
      bulkMode === "single_team",
      bulkDefaultTeamType === "existing"
        ? teams.find((t) => t.id === bulkDefaultTeamId)?.name
        : bulkDefaultNewTeamName.trim()
    );
  }, [csvText, bulkMode, bulkDefaultTeamId, bulkDefaultNewTeamName, bulkDefaultTeamType, teams]);

  const validRowsCount = parsedRows.filter((r) => r.isValid).length;
  const invalidRowsCount = parsedRows.filter((r) => !r.isValid).length;

  async function handleBulkSubmit() {
    setLocalError(null);
    if (parsedRows.length === 0) {
      setLocalError("Please paste or type CSV/TSV user records.");
      return;
    }
    if (validRowsCount === 0) {
      setLocalError("No valid rows found. Every row must have a username and team assigned.");
      return;
    }
    await onSubmit(parsedRows.filter((r) => r.isValid));
  }

  return (
    <Card className="p-5 border-border shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" /> Bulk Import Competitors
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Import multiple competitor accounts at once. Teams will be created automatically if they
            do not exist.
          </p>
        </div>
      </div>

      {localError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{localError}</span>
        </div>
      )}

      {bulkErrors.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-1">
          <div className="text-xs font-semibold text-destructive flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4" /> {bulkErrors.length} row(s) failed during creation:
          </div>
          <div className="max-h-24 overflow-y-auto text-[11px] font-mono text-destructive/90 space-y-0.5">
            {bulkErrors.map((err, i) => (
              <div key={i}>
                - {err.username}: {err.error}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mode selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label
          className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
            bulkMode === "csv_with_teams" ? "border-primary bg-primary/5" : "bg-muted/10"
          }`}
        >
          <input
            type="radio"
            name="bulkMode"
            checked={bulkMode === "csv_with_teams"}
            onChange={() => setBulkMode("csv_with_teams")}
            className="mt-0.5"
          />
          <div>
            <div className="text-xs font-semibold">CSV Includes Teams Column</div>
            <div className="text-[11px] text-muted-foreground font-mono">
              username, display_name, team_name, password
            </div>
          </div>
        </label>

        <label
          className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
            bulkMode === "single_team" ? "border-primary bg-primary/5" : "bg-muted/10"
          }`}
        >
          <input
            type="radio"
            name="bulkMode"
            checked={bulkMode === "single_team"}
            onChange={() => setBulkMode("single_team")}
            className="mt-0.5"
          />
          <div>
            <div className="text-xs font-semibold">Assign All Rows to One Team</div>
            <div className="text-[11px] text-muted-foreground font-mono">
              username, display_name, password
            </div>
          </div>
        </label>
      </div>

      {/* Target team selector for single team mode */}
      {bulkMode === "single_team" && (
        <div className="rounded-lg border bg-muted/10 p-3 space-y-2">
          <label className="text-xs font-semibold text-foreground block">
            Target Team for All Rows *
          </label>
          <div className="flex items-center gap-4 text-xs mb-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="bulkTeamType"
                checked={bulkDefaultTeamType === "existing"}
                onChange={() => setBulkDefaultTeamType("existing")}
              />
              Existing Team
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="bulkTeamType"
                checked={bulkDefaultTeamType === "new"}
                onChange={() => setBulkDefaultTeamType("new")}
              />
              Create New Team
            </label>
          </div>

          {bulkDefaultTeamType === "existing" ? (
            <select
              value={bulkDefaultTeamId}
              onChange={(e) => setBulkDefaultTeamId(e.target.value)}
              className="h-8 w-full rounded-md border bg-background px-3 text-xs"
            >
              <option value="">-- Choose Team --</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : (
            <Input
              value={bulkDefaultNewTeamName}
              onChange={(e) => setBulkDefaultNewTeamName(e.target.value)}
              placeholder="Team Name..."
              className="h-8 text-xs"
            />
          )}
        </div>
      )}

      {/* CSV Input textarea */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Paste CSV / TSV Rows (Header optional)
          </label>
          <span className="text-[11px] text-muted-foreground font-mono">
            {bulkMode === "csv_with_teams"
              ? "username, [display_name], team_name, [password]"
              : "username, [display_name], [password]"}
          </span>
        </div>
        <Textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={6}
          placeholder={
            bulkMode === "csv_with_teams"
              ? `alice, Alice Walker, Team Alpha, secret123\nbob, Bob Smith, Team Beta\ncharlie, Charlie Brown, Team Alpha`
              : `alice, Alice Walker, secret123\nbob, Bob Smith\ncharlie, Charlie Brown`
          }
          className="font-mono text-xs"
        />
      </div>

      {/* Live Preview Table */}
      {parsedRows.length > 0 && (
        <div className="space-y-2 border rounded-lg p-3 bg-muted/10">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold flex items-center gap-2">
              <span>Parsed Rows Preview ({parsedRows.length})</span>
              <Badge variant="outline" className="text-[10px] gap-1">
                <CheckCircle2 className="h-3 w-3 text-success" /> {validRowsCount} Valid
              </Badge>
              {invalidRowsCount > 0 && (
                <Badge variant="destructive" className="text-[10px] gap-1">
                  <AlertCircle className="h-3 w-3" /> {invalidRowsCount} Invalid
                </Badge>
              )}
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto rounded border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] h-7">Status</TableHead>
                  <TableHead className="text-[11px] h-7">Username</TableHead>
                  <TableHead className="text-[11px] h-7">Display Name</TableHead>
                  <TableHead className="text-[11px] h-7">Team</TableHead>
                  <TableHead className="text-[11px] h-7">Password</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedRows.map((row, idx) => (
                  <TableRow key={idx} className={row.isValid ? "" : "bg-destructive/5"}>
                    <TableCell className="py-1 text-xs">
                      {row.isValid ? (
                        <span className="text-success font-semibold text-[11px]">OK</span>
                      ) : (
                        <span className="text-destructive text-[11px] font-medium">
                          {row.validationError}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-1 text-xs font-mono">{row.username || "—"}</TableCell>
                    <TableCell className="py-1 text-xs">{row.displayName || "—"}</TableCell>
                    <TableCell className="py-1 text-xs font-medium">
                      {row.teamName || <span className="text-destructive">None</span>}
                    </TableCell>
                    <TableCell className="py-1 text-xs font-mono text-muted-foreground">
                      {row.password ? "Provided" : "Auto-gen"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleBulkSubmit}
          disabled={pending || validRowsCount === 0}
          className="gap-1.5 text-xs"
        >
          <Upload className="h-3.5 w-3.5" />
          {pending ? "Importing..." : `Import ${validRowsCount} Competitors`}
        </Button>
      </div>
    </Card>
  );
}
