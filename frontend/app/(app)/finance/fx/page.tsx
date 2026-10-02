"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { Field, inputClass } from "@/components/ui/form-helpers";
import { useToast } from "@/components/ui/toast";
import { listFXRates, upsertFXRate, type FXRate } from "@/lib/api/fx";

export default function FXPage() {
  const toast = useToast();
  const [items, setItems] = useState<FXRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [base, setBase] = useState("USD");
  const [quote, setQuote] = useState("IDR");
  const [rate, setRate] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listFXRates());
    } catch (err: any) {
      toastRef.current.error("Load failed", err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latestUSDIDR = items.find(
    (i) => i.base_currency === "USD" && i.quote_currency === "IDR",
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = parseFloat(rate);
    if (!r || r <= 0) {
      toast.error("Validation failed", "Rate must be a positive number.");
      return;
    }
    setSubmitting(true);
    try {
      await upsertFXRate({
        base_currency: base,
        quote_currency: quote,
        rate: r,
        effective_date: date || undefined,
      });
      toast.success("Rate saved", `${base}/${quote} = ${r}`);
      setRate("");
      load();
    } catch (err: any) {
      toast.error("Save failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <KpiCard
          label="USD/IDR latest"
          value={
            latestUSDIDR
              ? latestUSDIDR.rate.toLocaleString("id-ID", {
                  maximumFractionDigits: 2,
                })
              : "—"
          }
          sub={latestUSDIDR?.effective_date ?? "no rate yet"}
        />
        <KpiCard
          label="Rate entries"
          value={String(items.length)}
          sub="All pairs"
        />
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">FX rates</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Manual FX rate overrides per effective date (FR-FX).
          </p>
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-bg p-4 md:grid-cols-5"
      >
        <Field label="Base">
          <input
            value={base}
            onChange={(e) => setBase(e.target.value.toUpperCase())}
            className={inputClass()}
            maxLength={3}
            required
          />
        </Field>
        <Field label="Quote">
          <input
            value={quote}
            onChange={(e) => setQuote(e.target.value.toUpperCase())}
            className={inputClass()}
            maxLength={3}
            required
          />
        </Field>
        <Field label="Rate">
          <input
            type="number"
            step="0.00000001"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className={inputClass()}
            required
          />
        </Field>
        <Field label="Effective date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass()}
          />
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Saving..." : "Save rate"}
          </Button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-bg">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
            <tr>
              <th className="px-4 py-2.5">Pair</th>
              <th className="px-4 py-2.5 text-right">Rate</th>
              <th className="px-4 py-2.5">Effective</th>
              <th className="px-4 py-2.5">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-fg-subtle"
                >
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-fg-subtle"
                >
                  No FX rates yet. Add one above.
                </td>
              </tr>
            ) : (
              items.map((r) => (
                <tr
                  key={r.id}
                  className="transition-colors hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-fg">
                    {r.base_currency}/{r.quote_currency}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                    {r.rate.toLocaleString("id-ID", {
                      maximumFractionDigits: 4,
                    })}
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted">
                    {r.effective_date}
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted">{r.source}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
