"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { getMe } from "@/lib/api/users";
import { logout } from "@/lib/api/auth";
import { useTheme } from "@/lib/theme";

type Me = { full_name: string; email: string };

const THEME_OPTIONS = [
  {
    value: "light",
    label: "Light",
    icon: "M12 3v2M12 19v2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M3 12h2M19 12h2M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  },
  {
    value: "dark",
    label: "Dark",
    icon: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
  },
  {
    value: "system",
    label: "System",
    icon: "M2 5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5zM8 21h8M12 17v4",
  },
] as const;

export function ProfileMenu({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    getMe()
      .then((m) => setMe({ full_name: m.full_name, email: m.email }))
      .catch(() => undefined);
    fetch("/api/v1/users/me/avatar", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const blob = await res.blob();
        setAvatar(URL.createObjectURL(blob));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setThemeOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const handleLogout = async () => {
    await logout();
    window.location.assign("/login");
  };

  const initials = (me?.full_name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const currentTheme = THEME_OPTIONS.find((t) => t.value === theme);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-bg-subtle ${collapsed ? "justify-center" : ""}`}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-xs font-semibold text-accent">
            {initials}
          </span>
        )}
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium text-fg">
                {me?.full_name ?? "…"}
              </span>
              <span className="block truncate text-xs text-fg-subtle">
                {me?.email ?? ""}
              </span>
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className={`shrink-0 text-fg-subtle transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            >
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-xl border border-border bg-bg shadow-[0_16px_48px_rgba(10,14,20,0.35)]"
          >
            {/* Header: avatar kiri + nama + email */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-sm font-semibold text-accent">
                  {initials}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-fg">
                  {me?.full_name ?? "…"}
                </span>
                <span className="block truncate text-xs text-fg-subtle">
                  {me?.email ?? ""}
                </span>
              </span>
            </div>

            {/* Theme: tombol ber-chevron yang expand */}
            <div className="border-b border-border">
              <button
                onClick={() => setThemeOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-fg transition-colors hover:bg-bg-subtle"
              >
                <span className="flex items-center gap-2">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden
                  >
                    <path d={currentTheme?.icon ?? THEME_OPTIONS[2].icon} />
                  </svg>
                  Theme
                </span>
                <span className="flex items-center gap-1 text-xs text-fg-subtle">
                  {currentTheme?.label}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className={`transition-transform ${themeOpen ? "rotate-90" : ""}`}
                    aria-hidden
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </span>
              </button>
              <AnimatePresence initial={false}>
                {themeOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-0.5 px-2 pb-2">
                      {THEME_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setTheme(opt.value);
                            setThemeOpen(false);
                          }}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                            theme === opt.value
                              ? "bg-accent-subtle text-accent"
                              : "text-fg-muted hover:bg-bg-subtle hover:text-fg"
                          }`}
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
                            <path d={opt.icon} />
                          </svg>
                          {opt.label}
                          {theme === opt.value && (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="ml-auto"
                              aria-hidden
                            >
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-danger transition-colors hover:bg-danger/10"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
