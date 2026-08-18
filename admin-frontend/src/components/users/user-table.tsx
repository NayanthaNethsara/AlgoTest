import { useState } from "react";
import {
  KeyRound,
  Trash2,
  ShieldCheck,
  ShieldOff,
  Users,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { User } from "@/types/user";
import { FALLBACKS, grantOf, type AccessGrant } from "./types";

interface UserTableProps {
  users: User[];
  currentUserId?: string;
  pending: boolean;
  onResetPassword: (user: User) => void;
  onDeleteUser: (user: User) => void;
  onAssignTeam: (user: User) => void;
  onToggleExemption: (user: User) => void;
  onToggleFallback: (user: User, key: keyof AccessGrant, enabled: boolean) => void;
}

export function UserTable({
  users,
  currentUserId,
  pending,
  onResetPassword,
  onDeleteUser,
  onAssignTeam,
  onToggleExemption,
  onToggleFallback,
}: UserTableProps) {
  const [subTab, setSubTab] = useState<"competitors" | "admins">("competitors");
  const [searchQuery, setSearchQuery] = useState("");

  const competitorUsers = users.filter((u) => u.role === "competitor");
  const adminUsers = users.filter((u) => u.role === "admin");

  const currentList = subTab === "competitors" ? competitorUsers : adminUsers;
  const filteredUsers = currentList.filter(
    (u) =>
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.displayName && u.displayName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.teamName && u.teamName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs
          value={subTab}
          onValueChange={(v) => setSubTab(v as "competitors" | "admins")}
          className="w-auto"
        >
          <TabsList className="h-8">
            <TabsTrigger value="competitors" className="text-xs h-7 gap-1.5">
              Competitors
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {competitorUsers.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="admins" className="text-xs h-7 gap-1.5">
              Admins
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {adminUsers.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, username, team..."
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              {subTab === "competitors" && <TableHead>Team</TableHead>}
              <TableHead>Role</TableHead>
              {subTab === "competitors" && <TableHead>Submission Access</TableHead>}
              {subTab === "competitors" && <TableHead>Exemption</TableHead>}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={subTab === "competitors" ? 6 : 3}
                  className="p-8 text-center text-xs text-muted-foreground"
                >
                  {searchQuery
                    ? "No users match your search query."
                    : subTab === "competitors"
                    ? "No competitors found. Use \"Add Competitor\" or \"Bulk Import\" above."
                    : "No admin users found."}
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((u) => {
                const grant = grantOf(u);
                const isSelf = u.id === currentUserId;

                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium text-xs">
                        {u.displayName || u.username}
                        {isSelf && (
                          <Badge variant="outline" className="ml-1.5 text-[10px] py-0">
                            You
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground">{u.username}</div>
                    </TableCell>

                    {subTab === "competitors" && (
                      <TableCell>
                        {u.teamName ? (
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[11px] font-medium">
                              {u.teamName}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-[11px] text-destructive italic">No Team</span>
                        )}
                      </TableCell>
                    )}

                    <TableCell>
                      <Badge
                        variant={u.role === "admin" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {u.role}
                      </Badge>
                    </TableCell>

                    {subTab === "competitors" && (
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {FALLBACKS.map((f) => {
                            const active = grant[f.key];
                            return (
                              <button
                                key={f.key}
                                type="button"
                                onClick={() => onToggleFallback(u, f.key, !active)}
                                disabled={pending}
                                title={`${f.label}: ${f.cost}`}
                                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                                  active
                                    ? f.className
                                    : "bg-muted/40 text-muted-foreground border-transparent hover:border-border"
                                }`}
                              >
                                {f.badge}
                              </button>
                            );
                          })}
                        </div>
                      </TableCell>
                    )}

                    {subTab === "competitors" && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onToggleExemption(u)}
                          disabled={pending}
                          className="h-7 text-xs gap-1 px-2"
                        >
                          {u.proctorExempt ? (
                            <>
                              <ShieldOff className="h-3.5 w-3.5 text-rose-500" />
                              <span className="text-rose-500 font-medium text-[11px]">Exempt</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground text-[11px]">Active</span>
                            </>
                          )}
                        </Button>
                      </TableCell>
                    )}

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {subTab === "competitors" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onAssignTeam(u)}
                            disabled={pending}
                            title="Assign Team"
                            className="h-8 w-8 text-foreground"
                          >
                            <Users className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onResetPassword(u)}
                          disabled={pending}
                          title="Reset Password"
                          className="h-8 w-8 text-foreground"
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDeleteUser(u)}
                          disabled={pending || isSelf}
                          title={isSelf ? "Cannot delete yourself" : "Delete User"}
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 disabled:opacity-30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
