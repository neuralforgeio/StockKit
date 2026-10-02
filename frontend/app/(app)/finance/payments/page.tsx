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
  cancelPayment,
  listPayments,
  recordPayment,
  type Payment,
} from "@/lib/api/invoices";
import { listCashAccounts, type CashAccount } from "@/lib/api/finance";
import { listSupplierInvoices, type SupplierInvoice } from "@/lib/api/invoices";
import { fuzzyMatch } from "@/lib/fuzzy";
import { formatIDR } from "@/lib/format";

const statusTones: Record<string, string> = {
  completed: "bg-success/10 text-success",
  cancelled: "bg-bg-subtle text-fg-subtle",
};

export default function PaymentsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Payment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Payment | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [openRecord, setOpenRecord] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listPayments());
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
    const completed = items.filter((p) => p.status === "completed");
    const total = completed.reduce((s, p) => s + p.amount_minor, 0);
    return {
      total: items.length,
      completed: completed.length,
      totalPaid: total,
    };
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter((p) =>
        fuzzyMatch(query, [
          p.number,
          p.supplier_invoice_number,
          p.cash_account_name,
          p.reference,
        ]),
      ),
    [items, query],
  );

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await cancelPayment(cancelTarget.id);
      setCancelTarget(null);
      toast.success(
        `Cancelled ${cancelTarget.number}`,
        "Cash balance and invoice paid total restored.",
      );
      load();
    } catch (err: any) {
      toast.error("Cancel failed", err.message);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Total payments"
          value={String(kpis.total)}
          sub={`${kpis.completed} completed`}
        />
        <KpiCard
          label="Total paid out"
          value={formatIDR(kpis.totalPaid)}
          sub="Cumulative supplier payments"
        />
        <KpiCard
          label="Average payment"
          value={
            kpis.completed > 0
              ? formatIDR(kpis.totalPaid / kpis.completed)
              : "—"
          }
          sub="Per completed payment"
        />
        <KpiCard
          label="Latest payment"
          value={items[0]?.number ?? "—"}
          sub={
            items[0]
              ? new Date(items[0].created_at).toLocaleDateString("id-ID")
              : "No payments yet"
          }
        />
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Payments</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Payments made against supplier invoices from your cash accounts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search payment, invoice, reference"
          />
          <Button onClick={() => setOpenRecord(true)}>Record payment</Button>
        </div>
      </header>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-bg" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No payments yet"
          description="Record the first payment when you settle a supplier invoice."
          action={
            <Button onClick={() => setOpenRecord(true)}>Record payment</Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Payment</th>
                <th className="px-4 py-2.5">Invoice</th>
                <th className="px-4 py-2.5">Account</th>
                <th className="px-4 py-2.5">Method</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className="cursor-pointer transition-colors hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-accent">
                    {p.number}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">
                    {p.supplier_invoice_number}
                  </td>
                  <td className="px-4 py-2.5 text-fg">{p.cash_account_name}</td>
                  <td className="px-4 py-2.5 capitalize text-fg-muted">
                    {p.payment_method}
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted">
                    {new Date(p.payment_date).toLocaleDateString("id-ID")}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                    {formatIDR(p.amount_minor)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusTones[p.status] ?? "bg-bg-subtle text-fg-muted"}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td
                    className="px-4 py-2.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {p.status === "completed" && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => setCancelTarget(p)}
                          aria-label={`Cancel ${p.number}`}
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
                    )}
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
        eyebrow="Payment"
        title={selected?.number ?? ""}
      >
        {selected && (
          <div className="space-y-5">
            <DrawerSection label="Payment details">
              <DrawerFacts
                items={[
                  ["Invoice", selected.supplier_invoice_number],
                  ["Account", selected.cash_account_name],
                  ["Method", selected.payment_method],
                  [
                    "Date",
                    new Date(selected.payment_date).toLocaleDateString("id-ID"),
                  ],
                  ["Amount", formatIDR(selected.amount_minor)],
                  ["Reference", selected.reference || "—"],
                  ["Status", selected.status],
                ]}
              />
            </DrawerSection>
            {selected.note && (
              <DrawerSection label="Note">
                <p className="text-sm text-fg-muted">{selected.note}</p>
              </DrawerSection>
            )}
            {selected.status === "completed" && (
              <DrawerSection label="Actions">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCancelTarget(selected)}
                >
                  Cancel payment
                </Button>
                <p className="mt-2 text-xs text-fg-subtle">
                  Cancel restores the cash account balance and decrements the
                  invoice paid total.
                </p>
              </DrawerSection>
            )}
          </div>
        )}
      </DetailDrawer>

      {openRecord && (
        <RecordPaymentModal
          onClose={() => setOpenRecord(false)}
          onRecorded={(pay) => {
            setOpenRecord(false);
            setSelected(pay);
            toast.success(
              `Created ${pay.number}`,
              "Payment recorded against the invoice.",
            );
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
        title={`Cancel ${cancelTarget?.number}?`}
        description="Cash balance and invoice paid total will be restored."
        confirmLabel="Cancel payment"
        variant="danger"
        loading={cancelling}
      />
    </div>
  );
}

function RecordPaymentModal({
  onClose,
  onRecorded,
}: {
  onClose: () => void;
  onRecorded: (pay: Payment) => void;
}) {
  const toast = useToast();
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([listSupplierInvoices(), listCashAccounts()]).then(
      ([invs, accs]) => {
        const payable = invs.filter(
          (i) =>
            i.status !== "paid" &&
            i.status !== "cancelled" &&
            i.total_minor - i.paid_minor > 0,
        );
        const active = accs.filter((a) => a.is_active);
        setInvoices(payable);
        setAccounts(active);
        if (payable.length > 0) setInvoiceId(payable[0].id);
        if (active.length > 0) setAccountId(active[0].id);
      },
    );
  }, []);

  const invoice = invoices.find((i) => i.id === invoiceId);
  const remaining = invoice ? invoice.total_minor - invoice.paid_minor : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceId || !accountId || amount <= 0) {
      toast.error(
        "Validation failed",
        "Invoice, cash account, and positive amount are required.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const pay = await recordPayment({
        supplier_invoice_id: invoiceId,
        cash_account_id: accountId,
        amount_minor: amount,
        payment_date: date,
        payment_method: method,
        reference: reference.trim(),
        note: note.trim(),
      });
      onRecorded(pay);
    } catch (err: any) {
      toast.error("Record failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Record payment"
      icon={
        <ModalIcon path="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Supplier invoice"
            required
            hint={invoice ? `Remaining: ${formatIDR(remaining)}` : ""}
          >
            <select
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className={inputClass()}
              required
            >
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.number} · {formatIDR(i.total_minor - i.paid_minor)}{" "}
                  remaining
                </option>
              ))}
              {invoices.length === 0 && (
                <option value="">No payable invoices</option>
              )}
            </select>
          </Field>
          <Field label="Cash account" required>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className={inputClass()}
              required
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.number} · {a.name} ({formatIDR(a.balance_minor)})
                </option>
              ))}
              {accounts.length === 0 && (
                <option value="">No active cash accounts</option>
              )}
            </select>
          </Field>
          <Field
            label="Amount"
            required
            hint={remaining > 0 ? `Maximum ${formatIDR(remaining)}` : ""}
          >
            <CurrencyInput valueMinor={amount} onValueChange={setAmount} />
          </Field>
          <Field label="Payment date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass()}
            />
          </Field>
          <Field label="Payment method">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className={inputClass()}
            >
              <option value="transfer">Transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="ewallet">E-Wallet</option>
              <option value="cheque">Cheque</option>
            </select>
          </Field>
          <Field label="Reference">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className={inputClass("font-mono")}
              placeholder="Bank reference"
            />
          </Field>
          <Field label="Note">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass()}
              placeholder="Optional"
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              submitting || invoices.length === 0 || accounts.length === 0
            }
          >
            {submitting ? "Recording..." : "Record payment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
