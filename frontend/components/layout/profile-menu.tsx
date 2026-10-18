"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { API_BASE } from "@/lib/api/base";
import { useCurrentUser } from "@/lib/current-user";

/**
 * Sidebar profile block: avatar + identity (live via useCurrentUser store)
 * with an upward dropdown menu (Profile / Settings / Logout).
 * Identity updates instantly when a profile_updated WS event arrives —
 * no polling, no reload.
 */
export function ProfileMenu({ collapsed }: { collapsed: boolean }) {
  const me = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarV, setAvatarV] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Refresh avatar when the profile page uploads a new one
  useEffect(() => {
    const bump = () => {
      setAvatarFailed(false);
      setAvatarV((v) => v + 1);
    };
    window.addEventListener("stockkit:avatar-changed", bump);
    return () => window.removeEventListener("stockkit:avatar-changed", bump);
  }, []);

  const initials = useMemo(() => {
    const src = me?.full_name || me?.email || "?";
    return src
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");
  }, [me]);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      /* session dibersihkan server-side best-effort; tetap redirect */
    }
    window.location.href = "/login";
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex w-full items-center rounded-lg transition hover:bg-bg-subtle ${
          collapsed ? "justify-center p-1.5" : "gap-2.5 p-2"
        }`}
      >
        <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-bg-subtle">
          {!avatarFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${API_BASE}/users/me/avatar?v=${avatarV}`}
              alt="avatar"
              className="h-full w-full object-cover"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-fg-muted">
              {initials || "?"}
            </span>
          )}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium text-fg">
                {me?.full_name || "Loading..."}
              </span>
              <span className="block truncate text-[11px] text-fg-subtle">
                {me?.email || ""}
              </span>
            </span>
            <svg
              width="12"
              height="12"
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

      {/* Dropdown (opens upward) */}
      {open && (
        <div
          role="menu"
          className="modal-pop absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#151a21] p-1 shadow-2xl shadow-black/70 ring-1 ring-white/5"
        >
          <div className="border-b border-border px-3 py-2">
            <div className="truncate text-sm font-medium text-fg">
              {me?.full_name || "—"}
            </div>
            <div className="truncate text-[11px] text-fg-subtle">
              {me?.email || "—"}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(me?.roles ?? []).slice(0, 3).map((r) => (
                <span
                  key={r}
                  className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>

          <Link
            href="/settings/profile"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-fg-muted transition hover:bg-bg-subtle hover:text-fg"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            My profile
          </Link>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-fg-muted transition hover:bg-bg-subtle hover:text-fg"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </Link>

          <div className="my-1 h-px bg-border" />
          <button
            onClick={logout}
            disabled={loggingOut}
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-danger transition hover:bg-danger/10 disabled:opacity-60"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {loggingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
