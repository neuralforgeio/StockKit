"use client";

import { motion, type Variants } from "framer-motion";
import { LogoMark } from "@/components/brand/logo";
import { LoginForm } from "./login-form";
import "./login-anim.css";

const FEATURES = [
  {
    icon: "M20 7l-8-4-8 4v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10",
    label: "Real-time inventory",
  },
  { icon: "M3 3v18h18M7 15l4-4 3 3 5-6", label: "Order-to-cash sales" },
  {
    icon: "M9 12l2 2 4-4m5.6-4A12 12 0 0 0 12 3a12 12 0 0 0-9 21h18a12 12 0 0 0 0-12z",
    label: "Approval workflows",
  },
];

// Annotate with Variants so `ease` is contextually typed as a valid Easing literal.
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen bg-bg">
      {/* ===== Left brand panel (animated) ===== */}
      <div className="relative hidden w-1/2 overflow-hidden bg-[#0B0D10] lg:block">
        <div className="login-grid absolute inset-0" />
        <div
          className="login-orb h-72 w-72 bg-blue-600/40"
          style={{ top: "10%", left: "12%" }}
        />
        <div
          className="login-orb login-orb-2 h-80 w-80 bg-indigo-500/30"
          style={{ top: "45%", left: "55%" }}
        />
        <div
          className="login-orb login-orb-3 h-64 w-64 bg-cyan-500/25"
          style={{ top: "70%", left: "18%" }}
        />

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="relative z-10 flex h-full flex-col justify-center px-14"
        >
          <motion.div
            variants={item}
            className="login-logo-float mb-6 inline-flex w-fit"
          >
            <LogoMark size={56} />
          </motion.div>
          <motion.h1
            variants={item}
            className="text-4xl font-semibold tracking-tight text-white"
          >
            StockKit
          </motion.h1>
          <motion.p
            variants={item}
            className="mt-3 max-w-md text-sm leading-relaxed text-white/60"
          >
            Multi-tenant business operations platform — inventory, purchasing,
            sales, finance, and reporting for Indonesian companies.
          </motion.p>

          <div className="mt-10 space-y-4">
            {FEATURES.map((f) => (
              <motion.div
                key={f.label}
                variants={item}
                className="flex items-center gap-3"
              >
                <span className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-blue-400">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden
                  >
                    <path d={f.icon} />
                  </svg>
                  <span className="login-shimmer absolute inset-0 rounded-lg" />
                </span>
                <span className="text-sm text-white/80">{f.label}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ===== Right form panel ===== */}
      <div className="relative flex w-full items-center justify-center px-6 lg:w-1/2">
        <div className="login-grid absolute inset-0 lg:hidden" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative z-10 w-full max-w-md"
        >
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark size={40} />
            <span className="text-xl font-semibold text-fg">StockKit</span>
          </div>
          <div className="rounded-2xl border border-border bg-bg p-8 shadow-xl">
            <LoginForm />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
