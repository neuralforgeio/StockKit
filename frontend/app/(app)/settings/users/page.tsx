"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { useToast } from "@/components/ui/toast";
import {
  assignRoleMgmt,
  createUserMgmt,
  listRolesMgmt,
  listUsersMgmt,
  resetPasswordMgmt,
  revokeRoleMgmt,
  type ManagedUser,
  type Role,
} from "@/lib/api/users-mgmt";
import { fuzzyMatch } from "@/lib/fuzzy";

const ROLE_COLORS: Record<string, string> = {
  developer: "bg-purple-500/15 text-purple-400",
  owner: "bg-amber-500/15 text-amber-400",
  admin: "bg-red-500/15 text-red-400",
  finance: "bg-emerald-500/15 text-emerald-400",
  sales: "bg-blue-500/15 text-blue-400",
  purchasing: "bg-indigo-500/15 text-indigo-400",
  warehouse: "bg-cyan-500/15 text-cyan-400",
  auditor: "bg-pink-500/15 text-pink-400",
};

export default function UsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [assigningFor, setAssigningFor] = useState<ManagedUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<ManagedUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    email: "",
    full_name: "",
    password: "",
    confirm: "",
    roles: [] as string[],
  });
  const [resetDraft, setResetDraft] = useState({ password: "", confirm: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([listUsersMgmt(), listRolesMgmt()]);
      setUsers(u);
      setRoles(r);
    } catch (err: any) {
      toast.error("Load failed", err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () =>
      users.filter((u) =>
        fuzzyMatch(query, [u.email, u.full_name, ...u.roles]),
      ),
    [users, query],
  );

  const availableRolesFor = (u: ManagedUser) =>
    roles.filter((r) => !u.roles.includes(r.name));

  const handleAssign = async (user: ManagedUser, roleName: string) => {
    try {
      const updated = await assignRoleMgmt(user.id, roleName);
      setUsers((prev) => prev.map((x) => (x.id === user.id ? updated : x)));
      toast.success("Role assigned", `${roleName} granted to ${user.email}`);
      setAssigningFor(null);
    } catch (err: any) {
      toast.error("Assign failed", err.message);
    }
  };

  const handleRevoke = async (user: ManagedUser, roleName: string) => {
    if (roleName === "developer" && user.roles.length === 1) {
      toast.warning("Cannot revoke", "User must have at least one role");
      return;
    }
    if (!confirm(`Revoke "${roleName}" from ${user.email}?`)) return;
    try {
      const updated = await revokeRoleMgmt(user.id, roleName);
      setUsers((prev) => prev.map((x) => (x.id === user.id ? updated : x)));
      toast.success("Role revoked", `${roleName} removed from ${user.email}`);
    } catch (err: any) {
      toast.error("Revoke failed", err.message);
    }
  };
  const toggleDraftRole = (name: string) =>
    setCreateDraft((d) => ({
      ...d,
      roles: d.roles.includes(name)
        ? d.roles.filter((r) => r !== name)
        : [...d.roles, name],
    }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createDraft.password !== createDraft.confirm) {
      toast.error("Validation failed", "Passwords do not match");
      return;
    }
    if (createDraft.roles.length === 0) {
      toast.error("Validation failed", "Select at least one role");
      return;
    }
    setSubmitting(true);
    try {
      const u = await createUserMgmt({
        email: createDraft.email.trim(),
        full_name: createDraft.full_name.trim(),
        password: createDraft.password,
        roles: createDraft.roles,
      });
      setUsers((prev) => [u, ...prev]);
      setCreateOpen(false);
      setCreateDraft({
        email: "",
        full_name: "",
        password: "",
        confirm: "",
        roles: [],
      });
      toast.success("User created", `${u.email} can now sign in.`);
    } catch (err: any) {
      toast.error("Create failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetFor) return;
    if (resetDraft.password !== resetDraft.confirm) {
      toast.error("Validation failed", "Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      await resetPasswordMgmt(resetFor.id, resetDraft.password);
      setResetFor(null);
      setResetDraft({ password: "", confirm: "" });
      toast.success(
        "Password reset",
        `${resetFor.email} must sign in again on all devices.`,
      );
      load();
    } catch (err: any) {
      toast.error("Reset failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/settings"
            className="mb-2 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
          >
            ← Settings
          </Link>
          <h1 className="text-2xl font-semibold text-fg">Users & Roles</h1>
          <p className="text-sm text-fg-muted">
            Manage user accounts and assign roles. Role changes take effect on
            the next request via automatic permission refresh.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load} disabled={loading}>
            Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)}>Create User</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-bg-surface p-4">
        <div className="flex-1">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search email, name, role..."
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-bg-surface">
        {loading ? (
          <div className="p-12 text-center text-sm text-fg-muted">
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No users"
            description={
              query ? "No users match your search." : "No users registered yet."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg-subtle text-left text-xs uppercase tracking-wider text-fg-muted">
                <tr>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Roles</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-bg-subtle">
                    <td className="px-4 py-2 font-mono text-xs text-fg">
                      {u.email}
                    </td>
                    <td className="px-4 py-2 text-fg">{u.full_name}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          u.status === "active"
                            ? "bg-success/10 text-success"
                            : "bg-bg-subtle text-fg-muted"
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <span
                            key={r}
                            className={`group inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
                              ROLE_COLORS[r] ?? "bg-bg-subtle text-fg-muted"
                            }`}
                          >
                            {r}
                            <button
                              onClick={() => handleRevoke(u, r)}
                              className="ml-0.5 opacity-0 transition group-hover:opacity-100 hover:text-danger"
                              aria-label={`Revoke ${r}`}
                              title="Revoke role"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setResetFor(u)}
                          title="Reset password (logs out all devices)"
                        >
                          Reset PW
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setAssigningFor(u)}
                          disabled={availableRolesFor(u).length === 0}
                        >
                          + Role
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assign role modal */}
      {assigningFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setAssigningFor(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border bg-bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-fg">
              Assign role to {assigningFor.email}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              Current roles: {assigningFor.roles.join(", ") || "none"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {availableRolesFor(assigningFor).map((r) => (
                <Button
                  key={r.id}
                  size="sm"
                  variant="secondary"
                  onClick={() => handleAssign(assigningFor, r.name)}
                >
                  {r.name}
                </Button>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <Button variant="ghost" onClick={() => setAssigningFor(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create user modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setCreateOpen(false)}
        >
          <form
            className="w-full max-w-md space-y-4 rounded-lg border border-border bg-bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreate}
          >
            <h2 className="text-lg font-semibold text-fg">Create user</h2>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">
                Email
              </label>
              <input
                type="email"
                required
                value={createDraft.email}
                onChange={(e) =>
                  setCreateDraft({ ...createDraft, email: e.target.value })
                }
                className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-fg"
                placeholder="user@company.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">
                Full name
              </label>
              <input
                required
                value={createDraft.full_name}
                onChange={(e) =>
                  setCreateDraft({ ...createDraft, full_name: e.target.value })
                }
                className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-fg"
                placeholder="Nama lengkap"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={createDraft.password}
                  onChange={(e) =>
                    setCreateDraft({ ...createDraft, password: e.target.value })
                  }
                  className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-fg"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">
                  Confirm
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={createDraft.confirm}
                  onChange={(e) =>
                    setCreateDraft({ ...createDraft, confirm: e.target.value })
                  }
                  className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-fg"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">
                Roles
              </label>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleDraftRole(r.name)}
                    className={`rounded px-2 py-1 text-xs font-medium transition ${
                      createDraft.roles.includes(r.name)
                        ? (ROLE_COLORS[r.name] ?? "bg-accent/15 text-accent")
                        : "bg-bg-subtle text-fg-muted hover:text-fg"
                    }`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create user"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Reset password modal */}
      {resetFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setResetFor(null)}
        >
          <form
            className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleReset}
          >
            <h2 className="text-lg font-semibold text-fg">Reset password</h2>
            <p className="text-sm text-fg-muted">
              {resetFor.email} akan logout dari semua perangkat dan wajib login
              ulang.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">
                New password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={resetDraft.password}
                onChange={(e) =>
                  setResetDraft({ ...resetDraft, password: e.target.value })
                }
                className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-fg"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">
                Confirm
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={resetDraft.confirm}
                onChange={(e) =>
                  setResetDraft({ ...resetDraft, confirm: e.target.value })
                }
                className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-fg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setResetFor(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Resetting..." : "Reset password"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
