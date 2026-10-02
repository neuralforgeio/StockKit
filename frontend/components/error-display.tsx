"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Category = "auth" | "client" | "server" | "notfound";

type CatalogEntry = {
  title: string;
  tagline: string;
  reason: string;
  category: Category;
  chip: string;
};

const catalog: Record<number, CatalogEntry> = {
  400: {
    title: "Bad request",
    tagline: "A small adjustment on your side should resolve this.",
    reason:
      "The request could not be understood by the server. Check the payload and try again.",
    category: "client",
    chip: "Request",
  },
  401: {
    title: "Session expired",
    tagline: "Your session needs attention before continuing.",
    reason:
      "You are not signed in or your session has expired. Sign in again to continue.",
    category: "auth",
    chip: "Authentication",
  },
  403: {
    title: "Access denied",
    tagline: "Your session needs attention before continuing.",
    reason: "Your account does not have permission to perform this action.",
    category: "auth",
    chip: "Authorization",
  },
  404: {
    title: "Page not found",
    tagline: "Let's get you back to a working page.",
    reason: "The address you opened does not exist or was moved.",
    category: "notfound",
    chip: "Routing",
  },
  409: {
    title: "Conflict",
    tagline: "A small adjustment on your side should resolve this.",
    reason:
      "The change conflicts with the current state of the data. Refresh and retry.",
    category: "client",
    chip: "State",
  },
  422: {
    title: "Validation failed",
    tagline: "A small adjustment on your side should resolve this.",
    reason:
      "Some fields are missing or invalid. Review the form and try again.",
    category: "client",
    chip: "Validation",
  },
  429: {
    title: "Too many requests",
    tagline: "A small adjustment on your side should resolve this.",
    reason:
      "You have made too many requests in a short period. Wait a moment and try again.",
    category: "client",
    chip: "Rate limit",
  },
  500: {
    title: "Internal server error",
    tagline: "Our side hit an unexpected condition. Your data is safe.",
    reason:
      "Something went wrong on our side. The error has been logged. Retry in a moment.",
    category: "server",
    chip: "Server",
  },
  502: {
    title: "Bad gateway",
    tagline: "Our side hit an unexpected condition. Your data is safe.",
    reason: "An upstream service is temporarily unavailable. Retry shortly.",
    category: "server",
    chip: "Gateway",
  },
  503: {
    title: "Service unavailable",
    tagline: "Our side hit an unexpected condition. Your data is safe.",
    reason: "A required dependency is temporarily unavailable. Retry shortly.",
    category: "server",
    chip: "Dependency",
  },
  504: {
    title: "Gateway timeout",
    tagline: "Our side hit an unexpected condition. Your data is safe.",
    reason: "An upstream service took too long to respond. Retry shortly.",
    category: "server",
    chip: "Timeout",
  },
};

function describe(status: number): CatalogEntry {
  return (
    catalog[status] ?? {
      title: "Something went wrong",
      tagline: "Let's get you back to a working page.",
      reason: `The server responded with status ${status}.`,
      category: status >= 500 ? "server" : "client",
      chip: "Unexpected",
    }
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
    </svg>
  );
}

function HelpLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group inline-flex items-center gap-3 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg-subtle text-fg-subtle transition-colors group-hover:border-border-strong group-hover:text-accent">
          {icon}
        </span>
        {label}
      </Link>
    </li>
  );
}

type Props = {
  status?: number;
  message?: string;
  onRetry?: () => void;
};

export function ErrorDisplay({ status, message, onRetry }: Props) {
  const code = status ?? 500;
  const entry = describe(code);
  const [path, setPath] = useState("");

  useEffect(() => {
    setPath(window.location.pathname);
  }, []);

  useEffect(() => {
    if (code === 401) {
      const timer = setTimeout(() => window.location.assign("/login"), 3000);
      return () => clearTimeout(timer);
    }
  }, [code]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg-subtle px-4 py-10">
      <div
        className="error-grid-bg pointer-events-none absolute inset-0"
        aria-hidden
      />

      <div className="animate-error-card relative w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-bg shadow-[0_24px_64px_rgba(16,20,26,0.12)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between border-b border-border px-6 py-4 sm:px-10">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon-stockkit.png"
              alt="StockKit"
              className="h-8 w-8 rounded-lg"
            />
            <span className="text-sm font-semibold text-fg">StockKit</span>
          </div>
          <Link
            href="/"
            className="rounded-lg bg-accent-solid px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-solid-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="grid gap-10 px-6 py-10 sm:px-10 md:grid-cols-2 md:items-center">
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-widest text-fg-subtle">
              Error {code}
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-fg sm:text-5xl">
              {entry.title}
            </h1>
            <p className="mt-3 text-base font-medium text-accent">
              {entry.tagline}
            </p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-fg-muted">
              {message && message.trim() !== "" ? message : entry.reason}
            </p>

            <ul className="mt-8 space-y-3">
              <HelpLink
                href="/"
                label="Return to the dashboard"
                icon={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden
                  >
                    <path d="M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
                  </svg>
                }
              />
              <HelpLink
                href="/settings"
                label="Open workspace settings"
                icon={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden
                  >
                    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                }
              />
              <HelpLink
                href="/settings/about"
                label="Check system status and version"
                icon={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden
                  >
                    <path d="M3 12h4l2-7 4 14 2-7h4" />
                  </svg>
                }
              />
            </ul>

            <div className="mt-8 flex flex-wrap gap-2">
              {onRetry ? (
                <button
                  onClick={onRetry}
                  className="rounded-lg bg-accent-solid px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-solid-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  Try again
                </button>
              ) : (
                <Link
                  href="/"
                  className="rounded-lg bg-accent-solid px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-solid-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  Back to dashboard
                </Link>
              )}
              {code === 401 && (
                <Link
                  href="/login"
                  className="rounded-lg border border-border bg-bg px-5 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  Go to sign in
                </Link>
              )}
            </div>

            {code === 401 && (
              <p className="mt-4 text-xs text-fg-subtle">
                <span className="animate-error-blink mr-2 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle motion-reduce:animate-none" />
                <span className="align-middle">Redirecting to sign in</span>
              </p>
            )}
          </div>

          <div className="relative mx-auto flex h-72 w-full max-w-sm items-center justify-center">
            <p className="select-none bg-linear-to-br from-accent to-accent-solid-hover bg-clip-text font-mono text-[120px] font-black leading-none text-transparent sm:text-[140px]">
              {code}
            </p>

            <div className="animate-error-float absolute left-2 top-1/2 -translate-y-[15%] motion-reduce:animate-none">
              <div className="relative">
                <span className="animate-error-ring absolute -inset-2 rounded-2xl border-2 border-accent/40 motion-reduce:animate-none" />
                <span className="animate-error-ring-delay absolute -inset-2 rounded-2xl border-2 border-accent/30 motion-reduce:animate-none" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-bg shadow-[0_12px_32px_rgba(16,20,26,0.18)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icon-stockkit.png" alt="" className="h-10 w-10" />
                </div>
              </div>
            </div>

            <GearIcon className="animate-error-spin absolute right-4 top-6 h-7 w-7 text-fg-subtle/60 motion-reduce:animate-none" />
            <GearIcon className="animate-error-spin-rev absolute bottom-8 right-14 h-5 w-5 text-accent/50 motion-reduce:animate-none" />

            <span className="absolute right-0 top-1/2 rounded-full border border-border bg-bg-subtle px-2.5 py-1 text-[10px] font-medium text-fg-muted">
              {entry.chip}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-6 py-4 font-mono text-[11px] text-fg-subtle sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <span>StockKit v1.0.0</span>
          <span>
            reference {code}-{entry.category} · {path || "/"}
          </span>
        </div>
      </div>
    </div>
  );
}
