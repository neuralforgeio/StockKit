"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { createProduct, type CreateProductPayload } from "@/lib/api/products";
import { listUnits, type Unit } from "@/lib/api/units";

type Props = {
  onCreated: (sku: string) => void;
  onCancel: () => void;
};

type FieldErrors = Partial<Record<keyof CreateProductPayload, string>>;

export function ProductForm({ onCreated, onCancel }: Props) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unitId, setUnitId] = useState("");
  const [type, setType] = useState<"product" | "service">("product");
  const [costMethod, setCostMethod] = useState<"average" | "fifo">("average");
  const [sellPrice, setSellPrice] = useState("0");
  const [buyPrice, setBuyPrice] = useState("0");
  const [minStock, setMinStock] = useState("0");

  useEffect(() => {
    listUnits()
      .then((list) => {
        setUnits(list);
        if (list.length > 0 && !unitId) setUnitId(list[0].id);
      })
      .catch(() => setError("Unable to load units"));
  }, [unitId]);

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!sku.trim()) next.sku = "SKU is required";
    if (!name.trim()) next.name = "Name is required";
    if (!unitId) next.unit_id = "Unit is required";
    if (Number(sellPrice) < 0) next.default_sell_price_minor = "Must be ≥ 0";
    if (Number(buyPrice) < 0) next.default_buy_price_minor = "Must be ≥ 0";
    if (Number(minStock) < 0) next.min_stock = "Must be ≥ 0";
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validate();
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    setError(null);
    try {
      await createProduct({
        sku: sku.trim(),
        name: name.trim(),
        unit_id: unitId,
        type,
        cost_method: costMethod,
        default_sell_price_minor: Math.round(Number(sellPrice)),
        default_buy_price_minor: Math.round(Number(buyPrice)),
        min_stock: Math.round(Number(minStock)),
      });
      onCreated(sku.trim());
    } catch (err: any) {
      setError(err.message || "Failed to create product");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="SKU" error={errors.sku}>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className={inputClass(errors.sku)}
            placeholder="e.g. LP-TP-E14-5"
            autoFocus
          />
        </Field>
        <Field label="Name" error={errors.name}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass(errors.name)}
            placeholder="ThinkPad E14 Gen 5"
          />
        </Field>
        <Field label="Type">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            className={inputClass()}
          >
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>
        </Field>
        <Field label="Unit" error={errors.unit_id}>
          <select
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            className={inputClass(errors.unit_id)}
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} — {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cost method">
          <select
            value={costMethod}
            onChange={(e) => setCostMethod(e.target.value as any)}
            className={inputClass()}
          >
            <option value="average">Moving average</option>
            <option value="fifo">FIFO</option>
          </select>
        </Field>
        <Field label="Min stock" error={errors.min_stock}>
          <input
            type="number"
            min={0}
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
            className={inputClass(errors.min_stock) + " tabular-nums"}
          />
        </Field>
        <Field
          label="Default sell price (IDR)"
          error={errors.default_sell_price_minor}
        >
          <input
            type="number"
            min={0}
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            className={
              inputClass(errors.default_sell_price_minor) + " tabular-nums"
            }
            placeholder="12500000"
          />
        </Field>
        <Field
          label="Default buy price (IDR)"
          error={errors.default_buy_price_minor}
        >
          <input
            type="number"
            min={0}
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value)}
            className={
              inputClass(errors.default_buy_price_minor) + " tabular-nums"
            }
            placeholder="9500000"
          />
        </Field>
      </div>

      {error && (
        <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating..." : "Create product"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-fg-muted">{label}</label>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

function inputClass(error?: string) {
  return `block w-full rounded-md border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-offset-1 ${
    error
      ? "border-danger focus:ring-danger/30"
      : "border-border focus:border-accent focus:ring-accent/20"
  }`;
}
