"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2, Copy } from "lucide-react";
import {
  bulkCreateUsers,
  createUser,
  deleteUser,
  resetPassword,
  updateRole,
  type AdminUser,
} from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Credential = { username: string; password: string };

const ROLES = ["competitor", "admin"];

export function AdminUsers({
  users,
  currentUserId,
}: {
  users: AdminUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creds, setCreds] = useState<Credential[]>([]);
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<Credential[] | { error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      if (Array.isArray(result) && result.length) setCreds((prev) => [...result, ...prev]);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Users</h1>
        <span className="text-sm text-muted-foreground">{users.length} total</span>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {creds.length > 0 && <CredentialsPanel creds={creds} onClear={() => setCreds([])} />}

      <AddUserForm
        pending={pending}
        onCreate={(input) =>
          run(async () => {
            const res = await createUser(input);
            if ("error" in res) return res;
            return [{ username: res.user.username, password: res.password }];
          })
        }
      />

      <BulkImport
        pending={pending}
        onImport={(text, role) =>
          run(async () => {
            const res = await bulkCreateUsers(text, role);
            if ("error" in res) return res;
            return res.results
              .filter((r) => r.status === "created" && r.password)
              .map((r) => ({ username: r.username, password: r.password! }));
          })
        }
      />

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th>Username</Th>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Last login</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <Td className="font-mono">{u.username}</Td>
                <Td>{u.displayName}</Td>
                <Td>
                  <select
                    value={u.role}
                    disabled={pending || u.id === currentUserId}
                    onChange={(e) => run(() => updateRole(u.id, e.target.value))}
                    className="h-8 rounded-md border bg-transparent px-2 text-sm outline-none disabled:opacity-60"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Td>
                <Td className="text-muted-foreground">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "—"}
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          const res = await resetPassword(u.id);
                          if ("error" in res) return res;
                          return [{ username: u.username, password: res.password }];
                        })
                      }
                    >
                      <KeyRound className="size-4" />
                      Reset
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending || u.id === currentUserId}
                      onClick={() => {
                        if (confirm(`Delete ${u.username}?`)) run(() => deleteUser(u.id));
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CredentialsPanel({ creds, onClear }: { creds: Credential[]; onClear: () => void }) {
  const text = creds.map((c) => `${c.username},${c.password}`).join("\n");
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-chart-3/40 bg-chart-3/10 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          New credentials — shown once, copy them now
        </span>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(text)}>
            <Copy className="size-4" />
            Copy all
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Dismiss
          </Button>
        </div>
      </div>
      <ul className="flex flex-col gap-0.5 font-mono text-sm">
        {creds.map((c, i) => (
          <li key={i}>
            {c.username} · <span className="font-semibold">{c.password}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddUserForm({
  pending,
  onCreate,
}: {
  pending: boolean;
  onCreate: (input: { username: string; displayName?: string; role: string; password?: string }) => void;
}) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("competitor");
  const [password, setPassword] = useState("");

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border bg-card/50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onCreate({
          username: username.trim(),
          displayName: displayName.trim() || undefined,
          role,
          password: password.trim() || undefined,
        });
        setUsername("");
        setDisplayName("");
        setPassword("");
      }}
    >
      <span className="text-sm font-medium">Add a user</span>
      <div className="grid gap-2 sm:grid-cols-4">
        <Input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <Input placeholder="display name (optional)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="h-9 rounded-md border bg-transparent px-2 text-sm outline-none"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Input placeholder="password (auto if blank)" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" disabled={pending || !username.trim()} className="self-start">
        Create user
      </Button>
    </form>
  );
}

function BulkImport({
  pending,
  onImport,
}: {
  pending: boolean;
  onImport: (text: string, role: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [role, setRole] = useState("competitor");

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        Bulk import (CSV)
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card/50 p-4">
      <span className="text-sm font-medium">Bulk import</span>
      <p className="text-xs text-muted-foreground">
        One per line: <code>username,display name,password</code> — name and password optional
        (password auto-generated when blank).
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={"alice,Alice Smith\nbob,Bob\ncarol"}
        className="w-full rounded-md border bg-transparent p-3 font-mono text-sm outline-none"
      />
      <div className="flex items-center gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="h-9 rounded-md border bg-transparent px-2 text-sm outline-none"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Button
          disabled={pending || !text.trim()}
          onClick={() => {
            onImport(text, role);
            setText("");
            setOpen(false);
          }}
        >
          Import
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left font-medium ${className}`}>{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
