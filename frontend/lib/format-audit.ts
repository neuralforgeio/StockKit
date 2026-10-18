// Smart formatter for audit diff values: renders money as IDR, timestamps as
// local id-ID dates, booleans as Yes/No, and empty strings as "(empty)".
// UUID-to-label resolution is intentionally deferred (needs lookup APIs).

const MONEY = /_minor$/; // amount_minor, total_minor, unit_price_minor, ...
const TIME = /(_at|_date)$/; // created_at, submitted_at, due_date, ...

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatAuditValue(field: string, value: any): string {
  if (value === null || value === undefined) return "(empty)";

  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (typeof value === "number") {
    if (MONEY.test(field)) return idr.format(value);
    return String(value);
  }

  if (typeof value === "string") {
    if (value === "") return "(empty)";
    if (TIME.test(field)) {
      const t = Date.parse(value);
      if (!Number.isNaN(t)) {
        return new Date(t).toLocaleString("id-ID", {
          dateStyle: "medium",
          timeStyle: "short",
        });
      }
    }
    return value;
  }

  return JSON.stringify(value);
}
