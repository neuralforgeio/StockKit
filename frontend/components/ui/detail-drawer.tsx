"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
};

export function DetailDrawer({
  open,
  onClose,
  eyebrow,
  title,
  children,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[65] bg-[#0B0D10]/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col border-l border-border bg-bg shadow-[0_24px_64px_rgba(16,20,26,0.25)]"
            initial={{ x: 440 }}
            animate={{ x: 0 }}
            exit={{ x: 440 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            <header className="flex items-start justify-between border-b border-border px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  {eyebrow}
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold text-fg">
                  {title}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close panel"
                className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg"
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
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function DrawerSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
        {label}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function DrawerFacts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="space-y-1.5">
      {items.map(([k, v]) => (
        <div
          key={k}
          className="flex items-baseline justify-between gap-3 text-sm"
        >
          <dt className="text-fg-muted">{k}</dt>
          <dd className="text-right font-medium tabular-nums text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
