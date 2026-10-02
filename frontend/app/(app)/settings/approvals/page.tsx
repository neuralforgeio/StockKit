"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalIcon } from "@/components/ui/modal";
import { Field, inputClass } from "@/components/ui/form-helpers";
import { useToast } from "@/components/ui/toast";
import {
  createApprovalRule,
  deleteApprovalRule,
  listApprovalRules,
  updateApprovalRule,
  type ApprovalRule,
} from "@/lib/api/approval-rules";

const DOC_TYPES = ["PR", "PO", "SO", "ADJ", "REFUND"] as const;
const ROLES = ["owner", "manager", "finance", "developer"] as const;

type Draft = {
  document_type: string;
  name: string;
  threshold_minor: number;
  approver_role: string;
  level: string;
  active: boolean;
};

const emptyDraft: Draft = {
  document_type: "PR",
  name: "",
  threshold_minor: 0,
  approver_role: "owner",
  level: "1",
  active: true,
};

export default function ApprovalRulesPage() {
  const toast = useToast();
  const [items, setItems] = useState<ApprovalRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ApprovalRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApprovalRule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listApprovalRules());
    } catch (err: any) {
      toast.error("Load failed", err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditTarget(null);
    setDraft(emptyDraft);
    setOpen(true);
  };

  const openEdit = (rule: ApprovalRule) => {
    setEditTarget(rule);
    setDraft({
      document_type: rule.document_type,
      name: rule.name,
      threshold_minor: rule.threshold_minor,
      approver_role: rule.approver_role,
      level: String(rule.level),
      active: rule.active,
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      document_type: draft.document_type,
      name: draft.name.trim() || `${draft.document_type} above threshold`,
      threshold_minor: draft.threshold_minor,
      approver_role: draft.approver_role,
      level: Math.max(1, Number(draft.level) || 1),
      active: draft.active,
    };
    try {
      if (editTarget) {
        await updateApprovalRule(editTarget.id, payload);
        toast.success(
          "Rule updated",
          "New submissions will use the updated rule.",
        );
      } else {
        await createApprovalRule(payload);
        toast.success(
          "Rule created",
          "Documents above the threshold will require approval.",
        );
      }
      setOpen(false);
      load();
    } catch (err: any) {
      toast.error("Save failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteApprovalRule(deleteTarget.id);
      setDeleteTarget(null);
      toast.success(
        "Rule deleted",
        "The rule no longer applies to new submissions.",
      );
      load();
    } catch (err: any) {
      toast.error("Delete failed", err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/settings"
            className="text-xs text-fg-muted hover:text-fg"
          >
            ← Settings
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-fg">
            Approval rules
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Documents with value at or above the threshold require approval
            before proceeding.
          </p>
        </div>
        <Button onClick={openCreate}>Create rule</Button>
      </header>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-bg" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No approval rules"
          description="All documents are auto-approved. Create a rule to require approval above a threshold."
          action={<Button onClick={openCreate}>Create rule</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Document</th>
                <th className="px-4 py-2.5">Rule</th>
                <th className="px-4 py-2.5 text-right">Threshold</th>
                <th className="px-4 py-2.5">Approver</th>
                <th className="px-4 py-2.5 text-center">Level</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((rule) => (
                <tr
                  key={rule.id}
                  className="transition-colors hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-accent">
                    {rule.document_type}
                  </td>
                  <td className="px-4 py-2.5 text-fg">{rule.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                    {rule.threshold_minor === 0
                      ? "Always"
                      : `≥ ${new Intl.NumberFormat("id-ID").format(rule.threshold_minor)}`}
                  </td>
                  <td className="px-4 py-2.5 capitalize text-fg-muted">
                    {rule.approver_role}
                  </td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-fg">
                    {rule.level}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${rule.active ? "bg-success/10 text-success" : "bg-bg-subtle text-fg-muted"}`}
                    >
                      {rule.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        aria-label={`Edit ${rule.name}`}
                        onClick={() => openEdit(rule)}
                        className="rounded-md p-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          aria-hidden
                        >
                          <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </button>
                      <button
                        aria-label={`Delete ${rule.name}`}
                        onClick={() => setDeleteTarget(rule)}
                        className="rounded-md p-1.5 text-fg-subtle hover:bg-danger/10 hover:text-danger"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          aria-hidden
                        >
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          editTarget ? `Edit rule: ${editTarget.name}` : "Create approval rule"
        }
        description="Applies to new submissions only; existing approval instances are unaffected."
        icon={
          <ModalIcon path="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Document type" required>
              <select
                value={draft.document_type}
                onChange={(e) =>
                  setDraft({ ...draft, document_type: e.target.value })
                }
                className={inputClass()}
              >
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Approver role" required>
              <select
                value={draft.approver_role}
                onChange={(e) =>
                  setDraft({ ...draft, approver_role: e.target.value })
                }
                className={inputClass()}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Rule name">
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className={inputClass()}
                  placeholder="PR above 5 million"
                />
              </Field>
            </div>
            <Field label="Threshold (0 = always approve)">
              <CurrencyInput
                valueMinor={draft.threshold_minor}
                onValueChange={(v) =>
                  setDraft({ ...draft, threshold_minor: v })
                }
              />
            </Field>
            <Field label="Level" hint="Lower level approves first">
              <input
                type="number"
                min={1}
                value={draft.level}
                onChange={(e) => setDraft({ ...draft, level: e.target.value })}
                className={inputClass("tabular-nums")}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-fg-muted md:col-span-2">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) =>
                  setDraft({ ...draft, active: e.target.checked })
                }
                className="h-4 w-4 rounded border-border"
              />
              Rule active
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save rule"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete rule "${deleteTarget?.name}"?`}
        description="New documents will no longer require approval under this rule. Existing approval instances remain."
        confirmLabel="Delete rule"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
