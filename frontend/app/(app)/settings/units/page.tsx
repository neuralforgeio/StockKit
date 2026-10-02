"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Field, inputClass } from "@/components/ui/form-helpers";
import { useToast } from "@/components/ui/toast";
import {
  createUnit,
  deleteUnit,
  listUnits,
  updateUnit,
  type Unit,
} from "@/lib/api/units";

export default function UnitsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Unit | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Unit | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listUnits());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditTarget(null);
    setCode("");
    setName("");
    setOpen(true);
  };

  const openEdit = (u: Unit) => {
    setEditTarget(u);
    setCode(u.code);
    setName(u.name);
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editTarget) {
        await updateUnit(editTarget.id, {
          code: code.trim(),
          name: name.trim(),
        });
        toast.success(`Updated ${code.trim()}`, "Unit changes saved.");
      } else {
        await createUnit({ code: code.trim(), name: name.trim() });
        toast.success(
          `Created ${code.trim()}`,
          "The new unit is now available.",
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
    try {
      await deleteUnit(deleteTarget.id);
      toast.success(`Deleted ${deleteTarget.code}`, "The unit was removed.");
      setDeleteTarget(null);
      load();
    } catch (err: any) {
      toast.error("Delete failed", err.message);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Units</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Units of measurement for products and stock.
          </p>
        </div>
        <Button onClick={openCreate}>Create unit</Button>
      </header>

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl border border-border bg-bg" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No units yet"
          description="Create the first unit to measure product stock."
          action={<Button onClick={openCreate}>Create unit</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5 w-40" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((u) => (
                <tr
                  key={u.id}
                  className="transition-colors hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-fg">
                    {u.code}
                  </td>
                  <td className="px-4 py-2.5 text-fg">{u.name}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(u)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:bg-danger/10 hover:text-danger"
                        onClick={() => setDeleteTarget(u)}
                      >
                        Delete
                      </Button>
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
        title={editTarget ? `Edit ${editTarget.code}` : "Create unit"}
        size="sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Code" required>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className={inputClass("font-mono uppercase")}
              placeholder="PCS"
              autoFocus
              required
            />
          </Field>
          <Field label="Name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass()}
              placeholder="Piece"
              required
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save unit"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete unit "${deleteTarget?.code}"?`}
        description="Units used by products cannot be deleted. Deactivate is not available for units; reassign products first if needed."
        confirmLabel="Delete unit"
        variant="danger"
      />
    </div>
  );
}
