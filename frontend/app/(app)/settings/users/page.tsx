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
  setUserStatusMgmt,
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

/* ---------- Password field with eye toggle + match indicator ---------- */

function PasswordField({
  label,
  value,
  onChange,
  match,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  match?: boolean | null;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-xs font-medium text-fg-muted">
          {label}
        </label>
        {match === true && (
          <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
            Correct
          </span>
        )}
        {match === false && (
          <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
            Incorrect
          </span>
        )}
      </div>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          required
          minLength={8}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-border bg-bg px-3 py-1.5 pr-9 text-sm text-fg"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          title={show ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle transition hover:bg-bg-subtle hover:text-fg"
        >
          {show ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

/* ------------------------- Custom confirm modal ------------------------- */

function ConfirmModal({
  title,
  description,
  confirmLabel,
  danger,
  loading,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="modal-fade fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm modal-pop rounded-xl border border-white/10 bg-[#151a21] p-6 shadow-2xl shadow-black/70 ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        <p className="mt-2 text-sm text-fg-muted">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className={danger ? "!bg-danger hover:!bg-danger/90" : undefined}
          >
            {loading ? "Processing..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Page -------------------------------- */

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

  type ConfirmAction =
    | { kind: "revoke"; user: ManagedUser; role: string }
    | { kind: "status"; user: ManagedUser };
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
    null,
  );
  const [confirmLoading, setConfirmLoading] = useState(false);

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

  // Live match indicators (null = confirm masih kosong)
  const createMatch =
    createDraft.confirm.length > 0
      ? createDraft.password === createDraft.confirm
      : null;
  const resetMatch =
    resetDraft.confirm.length > 0
      ? resetDraft.password === resetDraft.confirm
      : null;

  const canSubmitCreate =
    !submitting &&
    createDraft.email.includes("@") &&
    createDraft.full_name.trim() !== "" &&
    createDraft.password.length >= 8 &&
    createMatch === true &&
    createDraft.roles.length > 0;

  const canSubmitReset =
    !submitting && resetDraft.password.length >= 8 && resetMatch === true;

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

  const handleRevoke = (user: ManagedUser, roleName: string) => {
    if (roleName === "developer" && user.roles.length === 1) {
      toast.error("Cannot revoke", "User must have at least one role");
      return;
    }
    setConfirmAction({ kind: "revoke", user, role: roleName });
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
    if (!canSubmitCreate) return;
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
    if (!resetFor || !canSubmitReset) return;
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

  const confirmMeta = useMemo(() => {
    if (!confirmAction) return null;
    if (confirmAction.kind === "revoke") {
      return {
        title: `Revoke role "${confirmAction.role}"?`,
        description: `Role akan dilepas dari ${confirmAction.user.email}. Perubahan berlaku pada request berikutnya (auto permission refresh).`,
        label: "Revoke role",
        danger: true,
      };
    }
    const deactivating = confirmAction.user.status === "active";
    return deactivating
      ? {
          title: `Deactivate ${confirmAction.user.email}?`,
          description:
            "User akan logout dari semua perangkat dan tidak dapat login sampai diaktifkan kembali.",
          label: "Deactivate",
          danger: true,
        }
      : {
          title: `Activate ${confirmAction.user.email}?`,
          description:
            "User dapat login kembali menggunakan password saat ini.",
          label: "Activate",
          danger: false,
        };
  }, [confirmAction]);

  const runConfirm = async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      if (confirmAction.kind === "revoke") {
        const updated = await revokeRoleMgmt(
          confirmAction.user.id,
          confirmAction.role,
        );
        setUsers((prev) =>
          prev.map((x) => (x.id === updated.id ? updated : x)),
        );
        toast.success(
          "Role revoked",
          `${confirmAction.role} removed from ${confirmAction.user.email}`,
        );
      } else {
        const next =
          confirmAction.user.status === "active" ? "inactive" : "active";
        const updated = await setUserStatusMgmt(confirmAction.user.id, next);
        setUsers((prev) =>
          prev.map((x) => (x.id === updated.id ? updated : x)),
        );
        toast.success(
          next === "inactive" ? "Deactivated" : "Activated",
          `${updated.email} is now ${next}.`,
        );
      }
    } catch (err: any) {
      toast.error("Action failed", err.message);
    } finally {
      setConfirmLoading(false);
      setConfirmAction(null);
    }
  };

  const handleToggleStatus = (u: ManagedUser) => {
    setConfirmAction({ kind: "status", user: u });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
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
          <Button onClick={() => setCreateOpen(true)}>Create user</Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-bg-surface p-4">
        <div className="flex-1">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search email, name, role..."
          />
        </div>
      </div>

      {/* Table */}
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
                          className={
                            u.status === "active"
                              ? "!text-danger hover:!bg-danger/10"
                              : "!text-success hover:!bg-success/10"
                          }
                          onClick={() => handleToggleStatus(u)}
                          title={
                            u.status === "active"
                              ? "Deactivate (logout all devices, block login)"
                              : "Activate"
                          }
                        >
                          {u.status === "active" ? "Deactivate" : "Activate"}
                        </Button>
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
          className="modal-fade fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setAssigningFor(null)}
        >
          <div
            className="w-full max-w-md modal-pop rounded-xl border border-white/10 bg-[#151a21] p-6 shadow-2xl shadow-black/70 ring-1 ring-white/5"
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
          className="modal-fade fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setCreateOpen(false)}
        >
          <form
            className="w-full max-w-md space-y-4 modal-pop rounded-xl border border-white/10 bg-[#151a21] p-6 shadow-2xl shadow-black/70 ring-1 ring-white/5"
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
              <PasswordField
                label="Password"
                value={createDraft.password}
                onChange={(v) =>
                  setCreateDraft({ ...createDraft, password: v })
                }
                placeholder="Min 8 karakter"
              />
              <PasswordField
                label="Confirm"
                value={createDraft.confirm}
                onChange={(v) => setCreateDraft({ ...createDraft, confirm: v })}
                match={createMatch}
                placeholder="Ulangi password"
              />
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
              <Button type="submit" disabled={!canSubmitCreate}>
                {submitting ? "Creating..." : "Create user"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Reset password modal */}
      {resetFor && (
        <div
          className="modal-fade fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setResetFor(null)}
        >
          <form
            className="w-full max-w-sm space-y-4 modal-pop rounded-xl border border-white/10 bg-[#151a21] p-6 shadow-2xl shadow-black/70 ring-1 ring-white/5"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleReset}
          >
            <h2 className="text-lg font-semibold text-fg">Reset password</h2>
            <p className="text-sm text-fg-muted">
              {resetFor.email} akan logout dari semua perangkat dan wajib login
              ulang. Password baru harus berbeda dari password saat ini.
            </p>
            <PasswordField
              label="New password"
              value={resetDraft.password}
              onChange={(v) => setResetDraft({ ...resetDraft, password: v })}
              placeholder="Min 8 karakter"
            />
            <PasswordField
              label="Confirm"
              value={resetDraft.confirm}
              onChange={(v) => setResetDraft({ ...resetDraft, confirm: v })}
              match={resetMatch}
              placeholder="Ulangi password"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setResetFor(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmitReset}>
                {submitting ? "Resetting..." : "Reset password"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Custom confirm modal (replaces native window.confirm) */}
      {confirmAction && confirmMeta && (
        <ConfirmModal
          title={confirmMeta.title}
          description={confirmMeta.description}
          confirmLabel={confirmMeta.label}
          danger={confirmMeta.danger}
          loading={confirmLoading}
          onCancel={() => setConfirmAction(null)}
          onConfirm={runConfirm}
        />
      )}
    </div>
  );
}
