"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Field, inputClass } from "@/components/ui/form-helpers";
import { useToast } from "@/components/ui/toast";
import {
  createCategory,
  deleteCategory,
  listCategories,
  setCategoryActive,
  updateCategory,
  type Category,
} from "@/lib/api/categories";

export default function CategoriesPage() {
  const toast = useToast();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listCategories());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditTarget(null);
    setName("");
    setParentId("");
    setOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditTarget(c);
    setName(c.name);
    setParentId(c.parent_id ?? "");
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { name: name.trim(), parent_id: parentId || null };
      if (editTarget) {
        await updateCategory(editTarget.id, payload);
        toast.success(`Updated "${name.trim()}"`, "Category changes saved.");
      } else {
        await createCategory(payload);
        toast.success(
          `Created "${name.trim()}"`,
          "The new category is now available.",
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

  const handleToggle = async (c: Category) => {
    try {
      await setCategoryActive(c.id, !c.active);
      toast.success(
        `${c.name} ${c.active ? "deactivated" : "activated"}`,
        c.active
          ? "It can no longer be selected on new products."
          : "It can be selected on new products.",
      );
      load();
    } catch (err: any) {
      toast.error("Update failed", err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCategory(deleteTarget.id);
      toast.success(
        `Deleted "${deleteTarget.name}"`,
        "The category was removed.",
      );
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
          <h1 className="text-2xl font-semibold text-fg">Categories</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Hierarchical classification for products.
          </p>
        </div>
        <Button onClick={openCreate}>Create category</Button>
      </header>

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl border border-border bg-bg" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Create the first category to organize products."
          action={<Button onClick={openCreate}>Create category</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Parent</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 w-52" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((c) => (
                <tr
                  key={c.id}
                  className="transition-colors hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-2.5 text-fg">{c.name}</td>
                  <td className="px-4 py-2.5 text-fg-muted">
                    {items.find((p) => p.id === c.parent_id)?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.active
                          ? "bg-success/10 text-success"
                          : "bg-bg-subtle text-fg-muted"
                      }`}
                    >
                      {c.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggle(c)}
                      >
                        {c.active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(c)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:bg-danger/10 hover:text-danger"
                        onClick={() => setDeleteTarget(c)}
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
        title={editTarget ? `Edit "${editTarget.name}"` : "Create category"}
        size="sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass()}
              placeholder="Electronics"
              autoFocus
              required
            />
          </Field>
          <Field label="Parent">
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className={inputClass()}
            >
              <option value="">— None —</option>
              {items
                .filter((c) => c.id !== editTarget?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
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
              {submitting ? "Saving..." : "Save category"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleteTarget?.name}"?`}
        description="Categories used by products or with children cannot be deleted. Reassign first, or deactivate instead."
        confirmLabel="Delete category"
        variant="danger"
      />
    </div>
  );
}
