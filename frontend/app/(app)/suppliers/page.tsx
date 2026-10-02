"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DetailDrawer,
  DrawerFacts,
  DrawerSection,
} from "@/components/ui/detail-drawer";
import { KpiCard } from "@/components/ui/kpi-card";
import { Modal, ModalIcon } from "@/components/ui/modal";
import { PhoneInput } from "@/components/ui/phone-input";
import { SearchInput } from "@/components/ui/search-input";
import { Field, inputClass } from "@/components/ui/form-helpers";
import { useToast } from "@/components/ui/toast";
import { listPurchaseOrders, type PurchaseOrder } from "@/lib/api/purchasing";
import {
  createSupplier,
  deleteSupplier,
  listSuppliers,
  setSupplierActive,
  updateSupplier,
  type Supplier,
} from "@/lib/api/suppliers";
import { fuzzyMatch } from "@/lib/fuzzy";
import { formatIDR } from "@/lib/format";

const OPEN_PO = ["issued", "partially_received"];

export default function SuppliersPage() {
  const toast = useToast();
  const [items, setItems] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    contact_name: "",
    email: "",
    phone: "",
    payment_terms_days: "30",
    bank_account: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sups, pos] = await Promise.all([
        listSuppliers(),
        listPurchaseOrders(),
      ]);
      setItems(sups);
      setOrders(pos);
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
    const openPos = orders.filter((po) => OPEN_PO.includes(po.status));
    return {
      total: items.length,
      active: items.filter((s) => s.active).length,
      openCount: openPos.length,
      openValue: openPos.reduce((s, po) => s + po.total_minor, 0),
    };
  }, [items, orders]);

  const filtered = useMemo(
    () =>
      items.filter((s) =>
        fuzzyMatch(query, [s.code, s.name, s.contact_name, s.email ?? ""]),
      ),
    [items, query],
  );

  const selectedOrders = useMemo(
    () =>
      orders.filter(
        (po) => po.supplier_id === selected?.id && OPEN_PO.includes(po.status),
      ),
    [orders, selected],
  );

  const openCreate = () => {
    setEditTarget(null);
    setDraft({
      name: "",
      contact_name: "",
      email: "",
      phone: "",
      payment_terms_days: "30",
      bank_account: "",
    });
    setOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditTarget(s);
    setDraft({
      name: s.name,
      contact_name: s.contact_name,
      email: s.email ?? "",
      phone: s.phone,
      payment_terms_days: String(s.payment_terms_days),
      bank_account: "",
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      name: draft.name.trim(),
      contact_name: draft.contact_name.trim(),
      email: draft.email.trim() || null,
      phone: draft.phone.trim(),
      payment_terms_days: Math.max(0, Number(draft.payment_terms_days) || 0),
      bank_account: draft.bank_account.trim() || null,
    };
    try {
      if (editTarget) {
        const updated = await updateSupplier(editTarget.id, payload);
        setItems((prev) =>
          prev.map((x) => (x.id === editTarget.id ? updated : x)),
        );
        toast.success(`Updated ${updated.code}`, "Supplier changes saved.");
      } else {
        const created = await createSupplier(payload);
        setItems((prev) => [...prev, created]);
        toast.success(
          `Created ${created.code}`,
          `${created.name} added to suppliers.`,
        );
      }
      setOpen(false);
    } catch (err: any) {
      toast.error("Save failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (s: Supplier) => {
    try {
      await setSupplierActive(s.id, !s.active);
      setItems((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, active: !s.active } : x)),
      );
      toast.success(
        `${s.code} ${s.active ? "deactivated" : "activated"}`,
        s.active
          ? "Historical POs keep resolving this supplier."
          : "The supplier can be selected on new POs.",
      );
    } catch (err: any) {
      toast.error("Update failed", err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSupplier(deleteTarget.id);
      setItems((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success(
        `Deleted ${deleteTarget.code}`,
        "The supplier was removed.",
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
          label="Total Suppliers"
          value={String(kpis.total)}
          sub={`${kpis.active} active`}
        />
        <KpiCard
          label="Active Suppliers"
          value={String(kpis.active)}
          sub={`${kpis.total - kpis.active} inactive`}
        />
        <KpiCard
          label="Open Purchase Orders"
          value={String(kpis.openCount)}
          sub="Issued or partially received"
        />
        <KpiCard
          label="Open PO Value"
          value={formatIDR(kpis.openValue)}
          sub="Committed spend"
          sparkTone="warning"
          spark={[0, kpis.openValue]}
        />
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Suppliers</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Vendor records with terms and open commitments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search code or name"
          />
          <Button onClick={openCreate}>Create supplier</Button>
        </div>
      </header>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-bg" />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg p-10 text-center text-sm text-fg-muted">
          No suppliers match this view yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5 text-right">Terms</th>
                <th className="px-4 py-2.5 text-right">Open POs</th>
                <th className="px-4 py-2.5">Bank</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((s) => {
                const openCount = orders.filter(
                  (po) =>
                    po.supplier_id === s.id && OPEN_PO.includes(po.status),
                ).length;
                return (
                  <tr
                    key={s.id}
                    onClick={() => setSelected(s)}
                    className="cursor-pointer transition-colors hover:bg-bg-subtle/60"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-accent">
                      {s.code}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-fg">
                      {s.name}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg-muted">
                      {s.payment_terms_days} d
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                      {openCount}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">
                      {s.bank_account_masked ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.active ? "bg-success/10 text-success" : "bg-bg-subtle text-fg-muted"}`}
                      >
                        {s.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div
                        className="flex justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          aria-label={`Edit ${s.code}`}
                          onClick={() => openEdit(s)}
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
                          aria-label={`Delete ${s.code}`}
                          onClick={() => setDeleteTarget(s)}
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
        eyebrow="Supplier detail"
        title={selected ? `${selected.name} (${selected.code})` : ""}
      >
        {selected && (
          <div className="space-y-5">
            <DrawerSection label="Profile">
              <DrawerFacts
                items={[
                  ["Contact", selected.contact_name || "—"],
                  ["Email", selected.email ?? "—"],
                  ["Phone", selected.phone || "—"],
                  ["Payment terms", `${selected.payment_terms_days} days`],
                  ["Bank account", selected.bank_account_masked ?? "—"],
                ]}
              />
            </DrawerSection>
            <DrawerSection label="Open purchase orders">
              <div className="space-y-2">
                {selectedOrders.map((po) => (
                  <div
                    key={po.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-bg-subtle/50 px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs text-accent">
                      {po.number}
                    </span>
                    <span className="capitalize text-fg-muted">
                      {po.status.replace("_", " ")}
                    </span>
                    <span className="tabular-nums text-fg">
                      {formatIDR(po.total_minor)}
                    </span>
                  </div>
                ))}
                {selectedOrders.length === 0 && (
                  <p className="text-sm text-fg-muted">
                    No open purchase orders.
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
        title={editTarget ? `Edit ${editTarget.code}` : "Create supplier"}
        icon={<ModalIcon path="M3 9l9-6 9 6v12H3V9zM9 21V12h6v9" />}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Name" required>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className={inputClass()}
                required
              />
            </Field>
            <Field label="Contact name">
              <input
                value={draft.contact_name}
                onChange={(e) =>
                  setDraft({ ...draft, contact_name: e.target.value })
                }
                className={inputClass()}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className={inputClass()}
              />
            </Field>
            <Field label="Phone">
              <PhoneInput
                value={draft.phone}
                onChange={(phone) => setDraft({ ...draft, phone })}
              />
            </Field>
            <Field label="Payment terms (days)">
              <input
                type="number"
                min={0}
                value={draft.payment_terms_days}
                onChange={(e) =>
                  setDraft({ ...draft, payment_terms_days: e.target.value })
                }
                className={inputClass("tabular-nums")}
              />
            </Field>
            <Field
              label="Bank account"
              hint="Stored encrypted, displayed masked"
            >
              <input
                value={draft.bank_account}
                onChange={(e) =>
                  setDraft({ ...draft, bank_account: e.target.value })
                }
                className={inputClass("font-mono")}
              />
            </Field>
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
              {submitting ? "Saving..." : "Save supplier"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleteTarget?.name}"?`}
        description="The supplier leaves the active catalog. Historical POs keep resolving by ID."
        confirmLabel="Delete supplier"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
