"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

type Country = {
  cc: string;
  name: string;
  dial: string;
  groups: number[];
  parens?: boolean;
};

const COUNTRIES: Country[] = [
  { cc: "ID", name: "Indonesia", dial: "62", groups: [3, 4, 4] },
  {
    cc: "US",
    name: "United States",
    dial: "1",
    groups: [3, 3, 4],
    parens: true,
  },
  { cc: "MY", name: "Malaysia", dial: "60", groups: [3, 4, 4] },
  { cc: "SG", name: "Singapore", dial: "65", groups: [4, 4] },
  { cc: "JP", name: "Japan", dial: "81", groups: [2, 4, 4] },
  { cc: "KR", name: "South Korea", dial: "82", groups: [2, 4, 4] },
  { cc: "IN", name: "India", dial: "91", groups: [5, 5] },
  { cc: "AU", name: "Australia", dial: "61", groups: [3, 3, 3] },
  { cc: "GB", name: "United Kingdom", dial: "44", groups: [4, 6] },
  { cc: "DE", name: "Germany", dial: "49", groups: [3, 7] },
];

function flag(cc: string): string {
  return cc
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

function group(digits: string, groups: number[]): string {
  const out: string[] = [];
  let i = 0;
  for (const g of groups) {
    if (i >= digits.length) break;
    out.push(digits.slice(i, i + g));
    i += g;
  }
  if (i < digits.length) out.push(digits.slice(i));
  return out.join("-");
}

function formatNational(digits: string, c: Country): string {
  if (c.parens && digits.length > 3) {
    return `(${digits.slice(0, 3)}) ${group(digits.slice(3), c.groups.slice(1))}`.trimEnd();
  }
  return group(digits, c.groups);
}

function parseValue(value: string): { country: Country; digits: string } {
  const m = value.match(/^\+(\d{1,3})\s?(.*)$/);
  if (m) {
    const found = COUNTRIES.find((c) => c.dial === m[1]);
    if (found) return { country: found, digits: m[2].replace(/\D/g, "") };
  }
  return { country: COUNTRIES[0], digits: value.replace(/\D/g, "") };
}

type Props = {
  value: string;
  onChange: (full: string) => void;
  placeholder?: string;
};

export function PhoneInput({ value, onChange, placeholder }: Props) {
  const initial = parseValue(value);
  const [country, setCountry] = useState<Country>(initial.country);
  const [digits, setDigits] = useState(initial.digits);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const emit = (c: Country, d: string) => {
    const formatted = formatNational(d, c);
    onChange(formatted ? `+${c.dial} ${formatted}` : "");
  };

  const handleChange = (raw: string) => {
    let text = raw;
    const dialMatch = text.match(/^(\+?\d{1,3})\s+(.*)$/);
    if (dialMatch) {
      const dial = dialMatch[1].replace("+", "");
      const found = COUNTRIES.find((c) => c.dial === dial);
      if (found) {
        setCountry(found);
        text = dialMatch[2];
        let d = text.replace(/\D/g, "").slice(0, 15);
        if (found.cc === "ID") d = d.replace(/^0+/, "");
        setDigits(d);
        emit(found, d);
        return;
      }
    }
    let d = text.replace(/\D/g, "").slice(0, 15);
    if (country.cc === "ID") d = d.replace(/^0+/, "");
    setDigits(d);
    emit(country, d);
  };

  const selectCountry = (c: Country) => {
    setCountry(c);
    setOpen(false);
    let d = digits;
    if (c.cc === "ID") d = d.replace(/^0+/, "");
    setDigits(d);
    emit(c, d);
  };

  return (
    <div ref={wrapRef} className="relative flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Select country code"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-l-md border border-r-0 border-border bg-bg-subtle px-2.5 py-2 text-sm text-fg transition-colors hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      >
        <span aria-hidden>{flag(country.cc)}</span>
        <span className="tabular-nums text-fg-muted">+{country.dial}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-fg-subtle"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <input
        type="tel"
        inputMode="tel"
        value={formatNational(digits, country)}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder ?? "838-5443-6555"}
        className="block w-full rounded-r-md border border-border bg-bg px-3 py-2 text-sm tabular-nums text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            className="absolute left-0 top-full z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-md border border-border bg-bg py-1 shadow-[0_8px_24px_rgba(20,24,31,0.12)]"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            {COUNTRIES.map((c) => (
              <li key={c.cc}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.cc === country.cc}
                  onClick={() => selectCountry(c)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-bg-subtle ${
                    c.cc === country.cc
                      ? "bg-accent-subtle text-accent"
                      : "text-fg"
                  }`}
                >
                  <span aria-hidden>{flag(c.cc)}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="tabular-nums text-fg-muted">+{c.dial}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
