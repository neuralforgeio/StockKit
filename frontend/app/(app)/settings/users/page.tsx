"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { useToast } from "@/components/ui/toast";
import {
  assignRoleMgmt,
  listRolesMgmt,
  listUsersMgmt,
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
        <Button variant="secondary" onClick={load} disabled={loading}>
          Refresh
        </Button>
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
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setAssigningFor(u)}
                        disabled={availableRolesFor(u).length === 0}
                      >
                        + Role
                      </Button>
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
    </div>
  );
}
