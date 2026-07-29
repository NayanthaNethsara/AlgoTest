"use client";

import { useState } from "react";
import { KeyRound, Trash2, Copy, Plus, Upload } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { User, CreateUserInput, BulkResult } from "@/types/user";

type Credential = { username: string; password: string };

const ROLES = ["competitor", "admin"];

export function AdminUsers({
  users,
  currentUserId,
  onRefresh,
}: {
  users: User[];
  currentUserId?: string;
  onRefresh: () => void;
}) {
  const [creds, setCreds] = useState<Credential[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("competitor");
  const [password, setPassword] = useState("");

  const [csvText, setCsvText] = useState("");
  const [bulkRole, setBulkRole] = useState("competitor");

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await apiFetch("/api/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({ username, displayName, role, password }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to create user");
      }
      const data = await res.json();
      setCreds((prev) => [{ username: data.user.username, password: data.password }, ...prev]);
      setUsername("");
      setDisplayName("");
      setPassword("");
      setShowAddForm(false);
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function handleBulkImport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const rows = parseCsv(csvText);
      if (rows.length === 0) throw new Error("No valid rows found");

      const res = await apiFetch("/api/v1/admin/users/bulk", {
        method: "POST",
        body: JSON.stringify({ role: bulkRole, users: rows }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Bulk import failed");
      }
      const data = await res.json();
      const createdCreds = (data.results as BulkResult[])
        .filter((r) => r.status === "created" && r.password)
        .map((r) => ({ username: r.username, password: r.password! }));

      setCreds((prev) => [...createdCreds, ...prev]);
      setCsvText("");
      setShowBulkForm(false);
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function handleResetPassword(id: string) {
    setError(null);
    setPending(true);
    try {
      const res = await apiFetch(`/api/v1/admin/users/${id}/reset-password`, {
        method: "POST",
        body: "{}",
      });
      if (!res.ok) throw new Error("Failed to reset password");
      const data = await res.json();
      const targetUser = users.find((u) => u.id === id);
      if (targetUser) {
        setCreds((prev) => [{ username: targetUser.username, password: data.password }, ...prev]);
      }
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function handleRoleChange(id: string, newRole: string) {
    setError(null);
    setPending(true);
    try {
      const res = await apiFetch(`/api/v1/admin/users/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error("Failed to update role");
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function handleDeleteUser(id: string) {
    if (!confirm("Are you sure you want to delete this user?")) return;
    setError(null);
    setPending(true);
    try {
      const res = await apiFetch(`/api/v1/admin/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete user");
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Users</h2>
          <p className="text-xs text-muted-foreground">{users.length} total user(s)</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBulkForm(!showBulkForm)}
            className="flex items-center px-3 py-1.5 text-xs rounded border bg-background hover:bg-muted font-medium"
          >
            <Upload className="h-3.5 w-3.5 mr-1" /> Bulk CSV Import
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground font-medium hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Single User
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      )}

      {creds.length > 0 && (
        <div className="rounded-lg border bg-green-500/10 p-4 border-green-500/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider">
              Generated Credentials (Copy Now)
            </span>
            <button onClick={() => setCreds([])} className="text-xs text-muted-foreground hover:underline">
              Clear
            </button>
          </div>
          <div className="font-mono text-xs max-h-36 overflow-y-auto space-y-1">
            {creds.map((c, i) => (
              <div key={i} className="flex justify-between border-b border-green-500/20 py-0.5">
                <span>{c.username}</span>
                <span className="font-bold">{c.password}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleCreateUser} className="rounded-lg border p-4 bg-muted/10 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required className="w-full h-8 rounded border bg-background px-2 text-xs" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Display Name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full h-8 rounded border bg-background px-2 text-xs" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full h-8 rounded border bg-background px-2 text-xs">
              <option value="competitor">competitor</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground font-medium">
              Save User
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-xs rounded border">
              Cancel
            </button>
          </div>
        </form>
      )}

      {showBulkForm && (
        <form onSubmit={handleBulkImport} className="rounded-lg border p-4 bg-muted/10 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">CSV Input (Format: username,display_name,password)</label>
            <div className="flex items-center gap-2 text-xs">
              <span>Role:</span>
              <select value={bulkRole} onChange={(e) => setBulkRole(e.target.value)} className="h-7 rounded border bg-background px-2 text-xs">
                <option value="competitor">competitor</option>
                <option value="admin">admin</option>
              </select>
            </div>
          </div>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={4}
            placeholder="alice, Alice Smith, secret123&#10;bob, Bob Jones"
            className="w-full rounded border bg-background p-2 font-mono text-xs"
            required
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowBulkForm(false)} className="px-3 py-1.5 text-xs rounded border">
              Cancel
            </button>
            <button type="submit" disabled={pending} className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground font-medium">
              Run Import
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Username</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Last Login</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t hover:bg-muted/20">
                <td className="px-4 py-3 font-mono">{u.username}</td>
                <td className="px-4 py-3">{u.displayName}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    disabled={pending || u.id === currentUserId}
                    className="h-7 rounded border bg-background px-2 text-xs"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleResetPassword(u.id)}
                      disabled={pending}
                      title="Reset Password"
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(u.id)}
                      disabled={pending || u.id === currentUserId}
                      title="Delete User"
                      className="p-1.5 rounded hover:bg-muted text-red-500 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function parseCsv(text: string): CreateUserInput[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^username\b/i.test(line))
    .map((line) => {
      const [username, displayName, password] = line.split(",").map((s) => s?.trim());
      return { username, displayName: displayName || undefined, password: password || undefined };
    })
    .filter((u) => u.username);
}
