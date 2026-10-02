"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DetailDrawer, DrawerSection } from "@/components/ui/detail-drawer";
import { KpiCard } from "@/components/ui/kpi-card";
import { Modal, ModalIcon } from "@/components/ui/modal";
import { SearchInput } from "@/components/ui/search-input";
import { Field, inputClass } from "@/components/ui/form-helpers";
import { useToast } from "@/components/ui/toast";
import { listStockLevels, type StockLevel } from "@/lib/api/inventory";
import {
  createWarehouse,
  deleteWarehouse,
  listWarehouses,
  setWarehouseActive,
  updateWarehouse,
  type Warehouse,
} from "@/lib/api/warehouses";
import { fuzzyMatch } from "@/lib/fuzzy";
import { formatIDR } from "@/lib/format";

export default function WarehousesPage() {
  const toast = useToast();
  const [items, setItems] = useState<Warehouse[]>([]);
  const [stock, setStock] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Warehouse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Warehouse | null>(null);
  const [draft, setDraft] = useState({ name: "", branch: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [whs, levels] = await Promise.all([
        listWarehouses(),
        listStockLevels(),
      ]);
      setItems(whs);
      setStock(levels);
    } catch (err: any) {
      toast.error("Load failed", err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = useMemo(() => {
    const unitsOnHand = stock.reduce((s, x) => s + x.on_hand, 0);
    const value = stock.reduce((s, x) => s + x.stock_value_minor, 0);
    return {
      total: items.length,
      active: items.filter((w) => w.active).length,
      unitsOnHand,
      value,
    };
  }, [items, stock]);

  const filtered = useMemo(
    () =>
      items.filter((w) => fuzzyMatch(query, [w.code, w.name, w.branch ?? ""])),
    [items, query],
  );

  const selectedLines = useMemo(
    () => stock.filter((s) => s.warehouse_id === selected?.id),
    [stock, selected],
  );

  const openCreate = () => {
    setEditTarget(null);
    setDraft({ name: "", branch: "" });
    setOpen(true);
  };

  const openEdit = (w: Warehouse) => {
    setEditTarget(w);
    setDraft({ name: w.name, branch: w.branch ?? "" });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      name: draft.name.trim(),
      branch: draft.branch.trim() || null,
    };
    try {
      if (editTarget) {
        const updated = await updateWarehouse(editTarget.id, payload);
        setItems((prev) =>
          prev.map((x) => (x.id === editTarget.id ? updated : x)),
        );
        toast.success(`Updated ${updated.code}`, "Warehouse changes saved.");
      } else {
        const created = await createWarehouse(payload);
        setItems((prev) => [...prev, created]);
        toast.success(
          `Created ${created.code}`,
          `${created.name} is ready to hold stock.`,
        );
      }
      setOpen(false);
    } catch (err: any) {
      toast.error("Save failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (w: Warehouse) => {
    try {
      await setWarehouseActive(w.id, !w.active);
      setItems((prev) =>
        prev.map((x) => (x.id === w.id ? { ...x, active: !w.active } : x)),
      );
      toast.success(
        `${w.code} ${w.active ? "deactivated" : "activated"}`,
        w.active
          ? "Stock history remains readable."
          : "The warehouse can receive new movements.",
      );
    } catch (err: any) {
      toast.error("Update failed", err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteWarehouse(deleteTarget.id);
      setItems((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success(
        `Deleted ${deleteTarget.code}`,
        "The warehouse was removed.",
      );
    } catch (err: any) {
      toast.error("Delete failed", err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Total Warehouses"
          value={String(kpis.total)}
          sub={`${kpis.active} active`}
        />
        <KpiCard
          label="Active Warehouses"
          value={String(kpis.active)}
          sub={`${kpis.total - kpis.active} inactive`}
        />
        <KpiCard
          label="Units on Hand"
          value={kpis.unitsOnHand.toLocaleString("id-ID")}
          sub="Across all locations"
        />
        <KpiCard
          label="Stock Value"
          value={formatIDR(kpis.value)}
          sub="At average cost"
          sparkTone="success"
          spark={[0, kpis.value]}
        />
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Warehouses</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Storage locations where inventory is held and shipped from.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search code, name, branch"
          />
          <Button onClick={openCreate}>Create warehouse</Button>
        </div>
      </header>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-bg" />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg p-10 text-center text-sm text-fg-muted">
          No warehouses match this view yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Branch</th>
                <th className="px-4 py-2.5 text-right">Lines</th>
                <th className="px-4 py-2.5 text-right">Units</th>
                <th className="px-4 py-2.5 text-right">Value</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((w) => {
                const lines = stock.filter((s) => s.warehouse_id === w.id);
                const unitsOnHand = lines.reduce((s, x) => s + x.on_hand, 0);
                const value = lines.reduce(
                  (s, x) => s + x.stock_value_minor,
                  0,
                );
                return (
                  <tr
                    key={w.id}
                    onClick={() => setSelected(w)}
                    className="cursor-pointer transition-colors hover:bg-bg-subtle/60"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-accent">
                      {w.code}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-fg">
                      {w.name}
                    </td>
                    <td className="px-4 py-2.5 text-fg-muted">
                      {w.branch ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg-muted">
                      {lines.length}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                      {unitsOnHand.toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                      {formatIDR(value)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${w.active ? "bg-success/10 text-success" : "bg-bg-subtle text-fg-muted"}`}
                      >
                        {w.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div
                        className="flex justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          aria-label={`Edit ${w.code}`}
                          onClick={() => openEdit(w)}
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
                          aria-label={`Delete ${w.code}`}
                          onClick={() => setDeleteTarget(w)}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        eyebrow="Warehouse detail"
        title={selected ? `${selected.name} (${selected.code})` : ""}
      >
        {selected && (
          <div className="space-y-5">
            <DrawerSection label="Stock lines">
              <div className="space-y-2">
                {selectedLines.map((s) => (
                  <div
                    key={s.product_id}
                    className="flex items-center justify-between rounded-lg border border-border bg-bg-subtle/50 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-fg">
                      {s.product_name}
                    </span>
                    <span className="tabular-nums text-fg">{s.on_hand} u</span>
                    <span className="tabular-nums text-fg-muted">
                      {formatIDR(s.stock_value_minor)}
                    </span>
                  </div>
                ))}
                {selectedLines.length === 0 && (
                  <p className="text-sm text-fg-muted">
                    No stock recorded at this location.
                  </p>
                )}
              </div>
            </DrawerSection>
          </div>
        )}
      </DetailDrawer>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editTarget ? `Edit ${editTarget.code}` : "Create warehouse"}
        icon={
          <ModalIcon path="M20 7l-8-4-8 4v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10" />
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Name" required>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={inputClass()}
              required
            />
          </Field>
          <Field label="Branch">
            <input
              value={draft.branch}
              onChange={(e) => setDraft({ ...draft, branch: e.target.value })}
              className={inputClass()}
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
              {submitting ? "Saving..." : "Save warehouse"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleteTarget?.name}"?`}
        description="Warehouses holding stock cannot be deleted. Move or consume stock first, or deactivate instead."
        confirmLabel="Delete warehouse"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
