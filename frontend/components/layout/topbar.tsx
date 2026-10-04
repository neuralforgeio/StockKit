"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSidebar } from "./sidebar";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/api/notifications";
import { realtime } from "@/lib/realtime";

const KIND_ICON: Record<string, string> = {
  approval_requested:
    "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  approval_decided: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function Topbar() {
  const { setMobileOpen } = useSidebar();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      setUnread(await getUnreadCount());
    } catch {
      // silent polling
    }
  }, []);

  useEffect(() => {
    realtime.connect();
    refreshCount();
    const t = setInterval(refreshCount, 60000); // fallback only
    const off = realtime.on(() => refreshCount());
    return () => {
      clearInterval(t);
      off();
    };
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    listNotifications()
      .then(setItems)
      .catch(() => undefined);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const handleRead = async (n: AppNotification) => {
    if (!n.read_at) {
      await markNotificationRead(n.id).catch(() => undefined);
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x,
        ),
      );
    }
  };

  const handleReadAll = async () => {
    await markAllNotificationsRead().catch(() => undefined);
    setUnread(0);
    setItems((prev) =>
      prev.map((x) => ({
        ...x,
        read_at: x.read_at ?? new Date().toISOString(),
      })),
    );
  };

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-bg px-4 sm:px-6">
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
        className="rounded-md p-2 text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg md:hidden"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      <div className="flex-1" />

      <div className="relative" ref={panelRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={`Notifications (${unread} unread)`}
          className="relative rounded-md p-2 text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-12 z-50 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-bg shadow-[0_16px_48px_rgba(10,14,20,0.35)]"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-fg">Notifications</p>
                <button
                  onClick={handleReadAll}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  Mark all read
                </button>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {items.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-fg-subtle">
                    No notifications yet.
                  </p>
                ) : (
                  items.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleRead(n)}
                      className={`flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-bg-subtle ${
                        n.read_at ? "opacity-60" : ""
                      }`}
                    >
                      <span className="mt-0.5 rounded-md bg-accent-subtle p-1.5 text-accent">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          aria-hidden
                        >
                          <path
                            d={KIND_ICON[n.kind] ?? KIND_ICON.approval_decided}
                          />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">
                          {n.title}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">
                          {n.body}
                        </span>
                        <span className="mt-1 block text-[10px] text-fg-subtle">
                          {timeAgo(n.created_at)}
                        </span>
                      </span>
                      {!n.read_at && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <span className="hidden rounded-md border border-border bg-bg-subtle px-2 py-1 font-mono text-xs text-fg-subtle sm:inline-block">
        v1.0.0
      </span>
    </header>
  );
}
