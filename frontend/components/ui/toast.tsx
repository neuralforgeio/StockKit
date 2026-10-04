"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type ToastVariant = "success" | "error" | "warning" | "info";
type Toast = {
  id: number;
  variant: ToastVariant;
  title: string;
  description?: string;
};

export type ToastAPI = {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string | { message: string; details?: Record<string, any> }) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastAPI | null>(null);

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const DURATION = 5000;

const VARIANT_STYLE: Record<
  ToastVariant,
  { bar: string; icon: string; path: string }
> = {
  success: {
    bar: "bg-success",
    icon: "text-success",
    path: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3",
  },
  error: {
    bar: "bg-danger",
    icon: "text-danger",
    path: "M12 8v4M12 16h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  },
  warning: {
    bar: "bg-warning",
    icon: "text-warning",
    path: "M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
  },
  info: {
    bar: "bg-accent",
    icon: "text-accent",
    path: "M12 16v-4M12 8h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (variant: ToastVariant, title: string, description?: string) => {
      seq.current += 1;
      const id = seq.current;
      setItems((prev) => [
        ...prev.slice(-4),
        { id, variant, title, description },
      ]);
      const t = setTimeout(() => dismiss(id), DURATION);
      timers.current.set(id, t);
    },
    [dismiss],
  );

  // API stabil (identity sama antar render) => mencegah useEffect([load]) re-run loop.
  const api = useMemo<ToastAPI>(
    () => ({
      success: (t, d) => push("success", t, d),
      error: (t, d) => push("error", t, d),
      warning: (t, d) => push("warning", t, d),
      info: (t, d) => push("info", t, d),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((t) => {
          const s = VARIANT_STYLE[t.variant];
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex overflow-hidden rounded-lg border border-border bg-bg shadow-lg"
            >
              <div className={`w-1 shrink-0 ${s.bar}`} />
              <div className="flex flex-1 items-start gap-3 p-3">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className={`mt-0.5 shrink-0 ${s.icon}`}
                  aria-hidden
                >
                  <path d={s.path} />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg">{t.title}</p>
                  {t.description && (
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {t.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  className="shrink-0 rounded p-1 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
