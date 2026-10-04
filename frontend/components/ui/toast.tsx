"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useRef, useState } from "react";

export type ToastVariant = "success" | "error" | "warning" | "info";

type Toast = {
  id: number;
  variant: ToastVariant;
  title: string;
  description?: string;
};

// Error description can be a plain string OR a structured object with details.
type ErrorDescription = string | { message: string; details?: Record<string, any> };

export type ToastAPI = {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: ErrorDescription) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastAPI | null>(null);

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

const ICONS: Record<ToastVariant, { path: string; className: string }> = {
  success: {
    path: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3",
    className: "text-success",
  },
  error: {
    path: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
    className: "text-danger",
  },
  warning: {
    path: "M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
    className: "text-warning",
  },
  info: {
    path: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
    className: "text-info",
  },
};

const BACKGROUNDS: Record<ToastVariant, string> = {
  success: "bg-success/10 border-success/30",
  error: "bg-danger/10 border-danger/30",
  warning: "bg-warning/10 border-warning/30",
  info: "bg-info/10 border-info/30",
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const icon = ICONS[toast.variant];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.96 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`pointer-events-auto flex max-w-sm items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-md ${BACKGROUNDS[toast.variant]}`}
      role="alert"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`mt-0.5 shrink-0 ${icon.className}`} aria-hidden>
        <path d={icon.path} />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 whitespace-pre-wrap text-xs text-white/75 break-words">{toast.description}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((variant: ToastVariant, title: string, description?: ErrorDescription) => {
    const id = nextId.current++;
    // Normalize description: object -> formatted multi-line string
    let desc: string | undefined;
    if (description === undefined || description === null) {
      desc = undefined;
    } else if (typeof description === "string") {
      desc = description;
    } else {
      // Structured error: "message\ndetails: {key: value, ...}"
      desc = description.message;
      if (description.details && Object.keys(description.details).length > 0) {
        const detailStr = Object.entries(description.details)
          .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
          .join(" · ");
        desc += `\n${detailStr}`;
      }
    }
    setToasts((prev) => [...prev, { id, variant, title, description: desc }]);
    window.setTimeout(() => dismiss(id), variant === "error" ? 8000 : 4500);
  }, [dismiss]);

  const api: ToastAPI = {
    success: (title, description) => push("success", title, description),
    error: (title, description) => push("error", title, description),
    warning: (title, description) => push("warning", title, description),
    info: (title, description) => push("info", title, description),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2 sm:right-6 sm:top-6">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
