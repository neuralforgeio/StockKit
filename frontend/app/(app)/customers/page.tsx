"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  setCustomerActive,
  updateCustomer,
  type Customer,
} from "@/lib/api/customers";
import { fuzzyMatch } from "@/lib/fuzzy";
import { formatIDR } from "@/lib/format";

export default function CustomersPage() {
  const toast = useToast();
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    type: "company" as "company" | "individual",
    contact_name: "",
    email: "",
    phone: "",
    payment_terms_days: "30",
    credit_limit_minor: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listCustomers());
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
    const total = items.length;
    const active = items.filter((c) => c.active).length;
    const exposure = items.reduce((s, c) => s + c.open_exposure_minor, 0);
    const limit = items.reduce((s, c) => s + c.credit_limit_minor, 0);
    const utilization = limit > 0 ? (exposure / limit) * 100 : 0;
    return { total, active, exposure, limit, utilization };
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter((c) =>
        fuzzyMatch(query, [c.code, c.name, c.contact_name, c.email ?? ""]),
      ),
    [items, query],
  );

  const openCreate = () => {
    setEditTarget(null);
    setDraft({
      name: "",
      type: "company",
      contact_name: "",
      email: "",
      phone: "",
      payment_terms_days: "30",
      credit_limit_minor: 0,
    });
    setOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditTarget(c);
    setDraft({
      name: c.name,
      type: c.type,
      contact_name: c.contact_name,
      email: c.email ?? "",
      phone: c.phone,
      payment_terms_days: String(c.payment_terms_days),
      credit_limit_minor: c.credit_limit_minor,
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      name: draft.name.trim(),
      type: draft.type,
      contact_name: draft.contact_name.trim(),
      email: draft.email.trim() || null,
      phone: draft.phone.trim(),
      payment_terms_days: Math.max(0, Number(draft.payment_terms_days) || 0),
      credit_limit_minor: draft.credit_limit_minor,
    };
    try {
      if (editTarget) {
        const updated = await updateCustomer(editTarget.id, payload);
        setItems((prev) =>
          prev.map((x) => (x.id === editTarget.id ? updated : x)),
        );
        toast.success(`Updated ${updated.code}`, "Customer changes saved.");
      } else {
        const created = await createCustomer(payload);
        setItems((prev) => [...prev, created]);
        toast.success(
          `Created ${created.code}`,
          `${created.name} added to customers.`,
        );
      }
      setOpen(false);
    } catch (err: any) {
      toast.error("Save failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (c: Customer) => {
    try {
      await setCustomerActive(c.id, !c.active);
      setItems((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, active: !c.active } : x)),
      );
      toast.success(
        `${c.code} ${c.active ? "deactivated" : "activated"}`,
        c.active
          ? "Historical documents keep resolving this customer."
          : "The customer can be selected on new documents.",
      );
    } catch (err: any) {
      toast.error("Update failed", err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCustomer(deleteTarget.id);
      setItems((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success(
        `Deleted ${deleteTarget.code}`,
        "The customer was removed.",
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
          label="Total Customers"
          value={String(kpis.total)}
          sub={`${kpis.active} active`}
        />
        <KpiCard
          label="Active Customers"
          value={String(kpis.active)}
          sub={`${kpis.total - kpis.active} inactive`}
        />
        <KpiCard
          label="Open Exposure"
          value={formatIDR(kpis.exposure)}
          sub="Sales orders + AR outstanding"
        />
        <KpiCard
          label="Credit Utilization"
          value={
            kpis.limit > 0 ? `${kpis.utilization.toFixed(1)}%` : "No limits"
          }
          sub={
            kpis.limit > 0
              ? `of ${formatIDR(kpis.limit)}`
              : "All customers unlimited"
          }
          sparkTone={kpis.utilization > 80 ? "danger" : "accent"}
          spark={[0, kpis.utilization]}
        />
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Customers</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Customer records with credit limits and exposure.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search code, name, email"
          />
          <Button onClick={openCreate}>Create customer</Button>
        </div>
      </header>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-bg" />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg p-10 text-center text-sm text-fg-muted">
          No customers match this view yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5 text-right">Terms</th>
                <th className="px-4 py-2.5 text-right">Credit Limit</th>
                <th className="px-4 py-2.5 text-right">Exposure</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="cursor-pointer transition-colors hover:bg-bg-subtle/60"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-accent">
                    {c.code}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-fg">{c.name}</td>
                  <td className="px-4 py-2.5 capitalize text-fg-muted">
                    {c.type}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg-muted">
                    {c.payment_terms_days} d
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                    {c.credit_limit_minor === 0
                      ? "Unlimited"
                      : formatIDR(c.credit_limit_minor)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                    {formatIDR(c.open_exposure_minor)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c.active ? "bg-success/10 text-success" : "bg-bg-subtle text-fg-muted"}`}
                    >
                      {c.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div
                      className="flex justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        aria-label={`Edit ${c.code}`}
                        onClick={() => openEdit(c)}
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
                        aria-label={`Delete ${c.code}`}
                        onClick={() => setDeleteTarget(c)}
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

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        eyebrow="Customer detail"
        title={selected ? `${selected.name} (${selected.code})` : ""}
      >
        {selected && (
          <div className="space-y-5">
            <DrawerSection label="Profile">
              <DrawerFacts
                items={[
                  ["Type", selected.type],
                  ["Contact", selected.contact_name || "—"],
                  ["Email", selected.email ?? "—"],
                  ["Phone", selected.phone || "—"],
                  ["Payment terms", `${selected.payment_terms_days} days`],
                ]}
              />
            </DrawerSection>
            <DrawerSection label="Credit position">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-fg-muted">Exposure</span>
                  <span className="tabular-nums font-medium text-fg">
                    {formatIDR(selected.open_exposure_minor)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-bg-subtle">
                  <div
                    className={`h-full rounded-full ${selected.credit_limit_minor > 0 && selected.open_exposure_minor / Math.max(selected.credit_limit_minor, 1) > 0.8 ? "bg-danger" : "bg-accent"}`}
                    style={{
                      width: `${selected.credit_limit_minor > 0 ? Math.min(100, (selected.open_exposure_minor / selected.credit_limit_minor) * 100) : 0}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-fg-subtle">
                  {selected.credit_limit_minor === 0
                    ? "No credit limit set (unlimited)."
                    : `Limit ${formatIDR(selected.credit_limit_minor)}.`}
                </p>
              </div>
            </DrawerSection>
          </div>
        )}
      </DetailDrawer>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editTarget ? `Edit ${editTarget.code}` : "Create customer"}
        icon={
          <ModalIcon path="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
        }
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
            <Field label="Type">
              <select
                value={draft.type}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    type: e.target.value as "company" | "individual",
                  })
                }
                className={inputClass()}
              >
                <option value="company">Company</option>
                <option value="individual">Individual</option>
              </select>
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
            <Field label="Credit limit (0 = unlimited)">
              <CurrencyInput
                valueMinor={draft.credit_limit_minor}
                onValueChange={(v) =>
                  setDraft({ ...draft, credit_limit_minor: v })
                }
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
              {submitting ? "Saving..." : "Save customer"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleteTarget?.name}"?`}
        description="The customer leaves the active catalog. Historical invoices keep resolving by ID."
        confirmLabel="Delete customer"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
