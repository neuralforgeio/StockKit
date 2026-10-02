"use client";

import { useLayoutEffect, useRef, useState } from "react";

const SYMBOLS: Record<string, string> = {
  IDR: "Rp",
  USD: "$",
  EUR: "€",
  JPY: "¥",
};

function compactHint(minor: number, currency: string): string {
  const sym = SYMBOLS[currency] ?? currency;
  if (currency !== "IDR") return `${sym} ${minor.toLocaleString("en-US")}`;
  if (minor >= 1_000_000_000)
    return `Rp ${trimNum(minor / 1_000_000_000)} miliar`;
  if (minor >= 1_000_000) return `Rp ${trimNum(minor / 1_000_000)} juta`;
  if (minor >= 1_000) return `Rp ${trimNum(minor / 1_000)} ribu`;
  return `Rp ${minor}`;
}

function trimNum(v: number): string {
  return v
    .toFixed(2)
    .replace(/\.?0+$/, "")
    .replace(".", ",");
}

type Props = {
  valueMinor: number;
  onValueChange: (minor: number) => void;
  currency?: string;
  placeholder?: string;
  compare?: boolean;
  disabled?: boolean;
};

export function CurrencyInput({
  valueMinor,
  onValueChange,
  currency = "IDR",
  placeholder,
  compare = true,
  disabled = false,
}: Props) {
  const [digits, setDigits] = useState(valueMinor ? String(valueMinor) : "");
  const inputRef = useRef<HTMLInputElement>(null);
  const caretDigits = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el || caretDigits.current === null) return;
    const target = caretDigits.current;
    caretDigits.current = null;
    let counted = 0;
    let pos = 0;
    const display = el.value;
    while (pos < display.length && counted < target) {
      if (/\d/.test(display[pos])) counted++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
  }, [digits]);

  const handleChange = (raw: string) => {
    if (disabled) return;
    const el = inputRef.current;
    if (el)
      caretDigits.current = raw
        .slice(0, el.selectionStart ?? 0)
        .replace(/\D/g, "").length;
    const next = raw.replace(/\D/g, "").slice(0, 15);
    setDigits(next);
    onValueChange(next ? parseInt(next, 10) : 0);
  };

  const display = digits ? Number(digits).toLocaleString("id-ID") : "";
  const minor = digits ? parseInt(digits, 10) : 0;

  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-fg-muted">
          {SYMBOLS[currency] ?? currency}
        </span>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={display}
          disabled={disabled}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder ?? "0"}
          className={`block w-full rounded-md border border-border bg-bg py-2 pl-10 pr-3 text-sm tabular-nums text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ${
            disabled ? "cursor-not-allowed opacity-60" : ""
          }`}
        />
      </div>
      {compare && minor > 0 && !disabled && (
        <p className="mt-1 text-xs tabular-nums text-fg-subtle">
          {compactHint(minor, currency)}
        </p>
      )}
    </div>
  );
}
