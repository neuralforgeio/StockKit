"use client";

import Link from "next/link";

type CardProps = {
  href: string;
  title: string;
  description: string;
  icon: string;
};

function Card({ href, title, description, icon }: CardProps) {
  return (
    <Link
      href={href}
      className="group card-surface flex items-start gap-4 rounded-xl border border-border p-5 transition-all duration-150 hover:border-accent hover:shadow-[0_4px_16px_rgba(29,78,216,0.08)]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent transition-colors group-hover:bg-accent group-hover:text-white">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d={icon} />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        <p className="mt-0.5 text-xs text-fg-muted">{description}</p>
      </div>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
        aria-hidden
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  );
}

const cards: CardProps[] = [
  {
    href: "/settings/organization",
    title: "Organization",
    description: "Legal name, address, tax ID, base currency.",
    icon: "M3 21h18M5 21V7l7-4 7 4v14M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1",
  },
  {
    href: "/settings/users",
    title: "Users",
    description: "Invite, roles, and deactivate users.",
    icon: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  },
  {
    href: "/warehouses",
    title: "Warehouses",
    description: "Storage locations, branches, and activation.",
    icon: "M20 7l-8-4-8 4v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10",
  },
  {
    href: "/settings/units",
    title: "Units",
    description: "Units of measurement for products and stock.",
    icon: "M2 12h4M18 12h4M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83",
  },
  {
    href: "/settings/categories",
    title: "Categories",
    description: "Hierarchical classification for products.",
    icon: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  },
  {
    href: "/settings/tax-codes",
    title: "Tax codes",
    description: "Tax rates and price modes for invoices.",
    icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  },
  {
    href: "/settings/cash-accounts",
    title: "Cash accounts",
    description: "Bank and cash accounts for payments.",
    icon: "M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7zM16 12h.01",
  },
  {
    href: "/settings/fx",
    title: "Exchange rates",
    description: "Latest FX rates and manual overrides.",
    icon: "M3 3v18h18M7 15l4-4 3 3 5-6",
  },
  {
    href: "/settings/about",
    title: "About",
    description: "Version, commit, build date, license.",
    icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v4M12 16h.01",
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-fg">Settings</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Configure your workspace, master data, and operational preferences.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.href} {...card} />
        ))}
      </div>
    </div>
  );
}
