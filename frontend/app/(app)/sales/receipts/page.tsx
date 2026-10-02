"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { Modal, ModalIcon } from "@/components/ui/modal";
import { SearchInput } from "@/components/ui/search-input";
import { Field, inputClass } from "@/components/ui/form-helpers";
import { useToast } from "@/components/ui/toast";
import { listCashAccounts, type CashAccount } from "@/lib/api/finance";
import {
  listCustomerInvoices,
  listCustomerReceipts,
  recordCustomerReceipt,
  type CustomerInvoice,
  type CustomerReceipt,
} from "@/lib/api/sales";
import { fuzzyMatch } from "@/lib/fuzzy";
import { formatIDR } from "@/lib/format";

export default function CustomerReceiptsPage() {
  const toast = useToast();
  const [items, setItems] = useState<CustomerReceipt[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("transfer");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rcpts, invs, accs] = await Promise.all([
        listCustomerReceipts(),
        listCustomerInvoices(),
        listCashAccounts(),
      ]);
      setItems(rcpts);
      setInvoices(
        invs.filter(
          (i: CustomerInvoice) =>
            i.status !== "paid" &&
            i.status !== "cancelled" &&
            i.total_minor - i.paid_minor > 0,
        ),
      );
      setAccounts(accs.filter((a: CashAccount) => a.is_active));
      setLoading(false);
    } catch (err: any) {
      toast.error("Load failed", err.message);
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (invoices.length > 0 && !invoiceId) setInvoiceId(invoices[0].id);
    if (accounts.length > 0 && !accountId) setAccountId(accounts[0].id);
  }, [invoices, accounts, invoiceId, accountId]);

  const invoice = invoices.find((i) => i.id === invoiceId);
  const remaining = invoice ? invoice.total_minor - invoice.paid_minor : 0;

  const kpis = useMemo(() => {
    const completed = items.filter((p) => p.status === "completed");
    const collected = completed.reduce((s, p) => s + p.amount_minor, 0);
    const openBalance = invoices.reduce(
      (s, i) => s + (i.total_minor - i.paid_minor),
      0,
    );
    return {
      total: items.length,
      collected,
      openInvoices: invoices.length,
      openBalance,
    };
  }, [items, invoices]);

  const filtered = useMemo(
    () =>
      items.filter((p) =>
        fuzzyMatch(query, [
          p.number,
          p.customer_invoice_number,
          p.cash_account_name,
        ]),
      ),
    [items, query],
  );

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
      const rcpt = await recordCustomerReceipt({
        customer_invoice_id: invoiceId,
        cash_account_id: accountId,
        amount_minor: amount,
        receipt_date: date,
        payment_method: method,
        reference: reference.trim(),
      });
      setOpen(false);
      toast.success(
        `Recorded ${rcpt.number}`,
        "Cash increased and customer exposure reduced.",
      );
      load();
    } catch (err: any) {
      toast.error("Record failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Receipts"
          value={String(kpis.total)}
          sub="Customer payments"
        />
        <KpiCard
          label="Collected"
          value={formatIDR(kpis.collected)}
          sub="Cumulative receipts"
        />
        <KpiCard
          label="Open invoices"
          value={String(kpis.openInvoices)}
          sub="Awaiting payment"
        />
        <KpiCard
          label="Receivable"
          value={formatIDR(kpis.openBalance)}
          sub="Open balance"
        />
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Customer receipts</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Payments received against customer invoices.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search receipt or invoice"
          />
          <Button onClick={() => setOpen(true)}>Record receipt</Button>
        </div>
      </header>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-bg" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No customer receipts yet"
          description="Record the first payment received from a customer."
          action={<Button onClick={() => setOpen(true)}>Record receipt</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Receipt</th>
                <th className="px-4 py-2.5">Invoice</th>
                <th className="px-4 py-2.5">Account</th>
                <th className="px-4 py-2.5">Method</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="transition-colors hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-accent">
                    {p.number}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">
                    {p.customer_invoice_number}
                  </td>
                  <td className="px-4 py-2.5 text-fg">{p.cash_account_name}</td>
                  <td className="px-4 py-2.5 capitalize text-fg-muted">
                    {p.payment_method}
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted">
                    {new Date(p.receipt_date).toLocaleDateString("id-ID")}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                    {formatIDR(p.amount_minor)}
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
        title="Record customer receipt"
        icon={
          <ModalIcon path="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label="Customer invoice"
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
                  <option value="">No open invoices</option>
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
                    {a.number} · {a.name}
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
            <Field label="Receipt date">
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
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                submitting || invoices.length === 0 || accounts.length === 0
              }
            >
              {submitting ? "Recording..." : "Record receipt"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
