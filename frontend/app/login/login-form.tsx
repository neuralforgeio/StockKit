"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api/auth";
import "./login-anim.css";

type Phase = "idle" | "success" | "error";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [shakeKey, setShakeKey] = useState(0);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phase === "success") return;
    setError("");
    setLoading(true);
    try {
      await login(email, password, remember);
      setPhase("success");
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 1100);
    } catch (err: any) {
      setPhase("error");
      setShakeKey((k) => k + 1);
      setError(err.message || "Email or password is incorrect.");
      setTimeout(() => setPhase("idle"), 700);
    } finally {
      setLoading(false);
    }
  };

  if (phase === "success") {
    return (
      <div
        className="flex flex-col items-center justify-center py-10 text-center"
        role="status"
        aria-live="polite"
      >
        <div className="login-pop">
          <svg
            width="72"
            height="72"
            viewBox="0 0 56 56"
            fill="none"
            aria-hidden
          >
            <circle
              cx="28"
              cy="28"
              r="26"
              stroke="var(--color-success)"
              strokeWidth="3"
              className="login-check-circle"
            />
            <path
              d="M17 29l8 8 14-16"
              stroke="var(--color-success)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="login-check-mark"
            />
          </svg>
        </div>
        <p className="login-fade-up mt-4 text-lg font-semibold text-fg">
          Login berhasil
        </p>
        <p className="login-fade-up mt-1 text-sm text-fg-muted">
          Menyiapkan workspace Anda...
        </p>
      </div>
    );
  }

  return (
    <motion.form
      key={shakeKey}
      onSubmit={handleSubmit}
      className={`space-y-5 ${phase === "error" ? "login-shake" : ""}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <div>
        <h2 className="text-xl font-semibold text-fg">Sign in</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Use your workspace account.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium text-fg">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="block w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          placeholder="you@company.co.id"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium text-fg">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="block w-full rounded-lg border border-border bg-bg px-3 py-2.5 pr-10 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-fg-subtle transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {showPassword ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden
              >
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden
              >
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        Keep me signed in on this device
      </label>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="mt-0.5 shrink-0"
            aria-hidden
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-accent-solid px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-solid-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>

      <p className="text-center text-xs text-fg-subtle">
        Sessions stay active for 30 days when remembered.
      </p>
    </motion.form>
  );
}
