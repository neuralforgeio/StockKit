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
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { Modal, ModalIcon } from "@/components/ui/modal";
import { SearchInput } from "@/components/ui/search-input";
import { Field, inputClass } from "@/components/ui/form-helpers";
import { useToast } from "@/components/ui/toast";
import {
  createCashAccount,
  deleteCashAccount,
  listCashAccounts,
  setCashAccountActive,
  updateCashAccount,
  type CashAccount,
} from "@/lib/api/finance";
import { fuzzyMatch } from "@/lib/fuzzy";
import { formatIDR } from "@/lib/format";

const typeLabels: Record<string, string> = {
  cash: "Cash",
  bank: "Bank",
  ewallet: "E-Wallet",
};

export default function CashAccountsPage() {
  const toast = useToast();
  const [items, setItems] = useState<CashAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CashAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CashAccount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<CashAccount | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    account_type: "bank" as "cash" | "bank" | "ewallet",
    balance_minor: 0,
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listCashAccounts());
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
    const totalBalance = items.reduce((s, a) => s + a.balance_minor, 0);
    const active = items.filter((a) => a.is_active).length;
    const paymentTotal = items.reduce((s, a) => s + a.payment_total, 0);
    return { total: items.length, active, totalBalance, paymentTotal };
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter((a) =>
        fuzzyMatch(query, [
          a.number,
          a.name,
          typeLabels[a.account_type] ?? a.account_type,
        ]),
      ),
    [items, query],
  );

  const openCreate = () => {
    setEditTarget(null);
    setDraft({ name: "", account_type: "bank", balance_minor: 0, notes: "" });
    setOpen(true);
  };

  const openEdit = (a: CashAccount) => {
    setEditTarget(a);
    setDraft({
      name: a.name,
      account_type: a.account_type,
      balance_minor: a.balance_minor,
      notes: a.notes,
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editTarget) {
        const updated = await updateCashAccount(editTarget.id, {
          name: draft.name.trim(),
          account_type: draft.account_type,
          notes: draft.notes.trim() || undefined,
        });
        setItems((prev) =>
          prev.map((x) => (x.id === editTarget.id ? updated : x)),
        );
        toast.success(
          `Updated ${updated.number}`,
          "Cash account changes saved.",
        );
      } else {
        const created = await createCashAccount({
          name: draft.name.trim(),
          account_type: draft.account_type,
          balance_minor: draft.balance_minor,
          notes: draft.notes.trim() || undefined,
        });
        setItems((prev) => [created, ...prev]);
        toast.success(
          `Created ${created.number}`,
          `${created.name} is ready for payments.`,
        );
      }
      setOpen(false);
      setEditTarget(null);
      load();
    } catch (err: any) {
      toast.error("Save failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (a: CashAccount) => {
    try {
      const updated = await setCashAccountActive(a.id, !a.is_active);
      setItems((prev) => prev.map((x) => (x.id === a.id ? updated : x)));
      toast.success(
        `${a.number} ${a.is_active ? "deactivated" : "activated"}`,
        a.is_active
          ? "Historical payments stay intact."
          : "The account can now receive payments.",
      );
    } catch (err: any) {
      toast.error("Update failed", err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCashAccount(deleteTarget.id);
      setItems((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success(`Deleted ${deleteTarget.number}`, "Cash account removed.");
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
          label="Cash accounts"
          value={String(kpis.total)}
          sub={`${kpis.active} active`}
        />
        <KpiCard
          label="Active accounts"
          value={String(kpis.active)}
          sub={`${kpis.total - kpis.active} inactive`}
        />
        <KpiCard
          label="Total balance"
          value={formatIDR(kpis.totalBalance)}
          sub="Across all accounts"
        />
        <KpiCard
          label="Payments out"
          value={formatIDR(kpis.paymentTotal)}
          sub="Cumulative supplier payments"
        />
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Cash accounts</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Cash, bank, and e-wallet accounts used for payments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search number or name"
          />
          <Button onClick={openCreate}>Create account</Button>
        </div>
      </header>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-bg" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No cash accounts yet"
          description="Create the first account so payments can be recorded."
          action={<Button onClick={openCreate}>Create account</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Number</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5 text-right">Balance</th>
                <th className="px-4 py-2.5 text-right">Payments</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className="cursor-pointer transition-colors hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-accent">
                    {a.number}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-fg">{a.name}</td>
                  <td className="px-4 py-2.5 text-fg-muted">
                    {typeLabels[a.account_type] ?? a.account_type}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                    {formatIDR(a.balance_minor)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg-muted">
                    {formatIDR(a.payment_total)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${a.is_active ? "bg-success/10 text-success" : "bg-bg-subtle text-fg-muted"}`}
                    >
                      {a.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div
                      className="flex justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        aria-label={`Edit ${a.number}`}
                        onClick={() => openEdit(a)}
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
                        aria-label={`Delete ${a.number}`}
                        onClick={() => setDeleteTarget(a)}
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
        eyebrow="Cash account"
        title={selected ? `${selected.name} (${selected.number})` : ""}
      >
        {selected && (
          <div className="space-y-5">
            <DrawerSection label="Account details">
              <DrawerFacts
                items={[
                  [
                    "Type",
                    typeLabels[selected.account_type] ?? selected.account_type,
                  ],
                  ["Currency", selected.currency],
                  ["Balance", formatIDR(selected.balance_minor)],
                  [
                    "Payments",
                    `${selected.payment_count} · ${formatIDR(selected.payment_total)}`,
                  ],
                  ["Status", selected.is_active ? "Active" : "Inactive"],
                ]}
              />
            </DrawerSection>
            <DrawerSection label="Actions">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    openEdit(selected);
                    setSelected(null);
                  }}
                >
                  Edit account
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleToggle(selected)}
                >
                  {selected.is_active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </DrawerSection>
            {selected.notes && (
              <DrawerSection label="Notes">
                <p className="text-sm text-fg-muted">{selected.notes}</p>
              </DrawerSection>
            )}
          </div>
        )}
      </DetailDrawer>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setEditTarget(null);
        }}
        title={editTarget ? `Edit ${editTarget.number}` : "Create cash account"}
        icon={
          <ModalIcon path="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Name" required>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className={inputClass()}
                placeholder="Operating cash"
                required
              />
            </Field>
            <Field label="Type">
              <select
                value={draft.account_type}
                onChange={(e) =>
                  setDraft({ ...draft, account_type: e.target.value as any })
                }
                className={inputClass()}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="ewallet">E-Wallet</option>
              </select>
            </Field>
            <Field label="Opening balance">
              <CurrencyInput
                valueMinor={draft.balance_minor}
                onValueChange={(v) => setDraft({ ...draft, balance_minor: v })}
                disabled={editTarget !== null}
              />
            </Field>
            <Field label="Notes">
              <input
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                className={inputClass()}
                placeholder="Bank account, branch, reference"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setEditTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving..."
                : editTarget
                  ? "Save changes"
                  : "Save account"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleteTarget?.name}"?`}
        description="Cash accounts with recorded payments cannot be deleted. Deactivate instead."
        confirmLabel="Delete account"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
