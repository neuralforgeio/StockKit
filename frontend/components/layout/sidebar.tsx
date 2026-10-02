"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { getDevMe } from "@/lib/api/dev";
import { ProfileMenu } from "./profile-menu";

type SidebarContextValue = {
  collapsed: boolean;
  toggleCollapsed: () => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used inside SidebarProvider");
  return ctx;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("stockkit.sidebar");
    if (stored === "1") setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      window.localStorage.setItem("stockkit.sidebar", prev ? "0" : "1");
      return !prev;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SidebarContext.Provider
      value={{ collapsed, toggleCollapsed, mobileOpen, setMobileOpen }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

type NavChild = { href: string; label: string; devOnly?: boolean };
type NavItem = {
  href: string;
  label: string;
  icon: string;
  children?: NavChild[];
  devOnly?: boolean;
};
type NavSection = { id: string; label: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    id: "main",
    label: "",
    items: [
      {
        href: "/",
        label: "Dashboard",
        icon: "M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10",
      },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    items: [
      {
        href: "/products",
        label: "Products",
        icon: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8",
        children: [
          { href: "/settings/categories", label: "Categories" },
          { href: "/settings/units", label: "Units" },
        ],
      },
    ],
  },
  {
    id: "parties",
    label: "Parties",
    items: [
      {
        href: "/customers",
        label: "Customers",
        icon: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
      },
      {
        href: "/suppliers",
        label: "Suppliers",
        icon: "M3 9l9-6 9 6v12H3V9zM9 21V12h6v9",
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      {
        href: "/warehouses",
        label: "Warehouses",
        icon: "M20 7l-8-4-8 4v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10",
      },
      {
        href: "/inventory",
        label: "Inventory",
        icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
      },
      {
        href: "/purchasing",
        label: "Purchasing",
        icon: "M6 6h15l-1.5 9h-12L6 6zM6 6 5 3H2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
        children: [
          { href: "/purchasing", label: "Purchase requests" },
          { href: "/purchasing/orders", label: "Purchase orders" },
          { href: "/purchasing/receipts", label: "Goods receipts" },
          { href: "/purchasing/invoices", label: "Supplier invoices" },
        ],
      },
      {
        href: "/sales",
        label: "Sales",
        icon: "M3 3v18h18M7 15l4-4 3 3 5-6",
        children: [
          { href: "/sales", label: "Sales orders" },
          { href: "/sales/invoices", label: "Customer invoices" },
          { href: "/sales/receipts", label: "Customer receipts" },
        ],
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      {
        href: "/finance/accounts",
        label: "Cash accounts",
        icon: "M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7zM16 12h.01",
      },
      {
        href: "/finance/fx",
        label: "FX rates",
        icon: "M3 12h4l2-7 4 14 2-7h4",
      },
      {
        href: "/reports",
        label: "Reports",
        icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M8 17v-4M12 17v-6M16 17v-2",
      },
    ],
  },
  {
    id: "system",
    label: "",
    items: [
      {
        href: "/developer",
        label: "Developer",
        icon: "M8 9l-4 3 4 3M16 9l4 3-4 3M13 5l-2 14",
        devOnly: true,
        children: [
          { href: "/developer", label: "Overview" },
          { href: "/developer/audit", label: "Audit logs", devOnly: true },
        ],
      },
      {
        href: "/settings",
        label: "Settings",
        icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
      },
    ],
  },
];

function CollapseToggle({
  collapsed,
  onClick,
}: {
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={
        collapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"
      }
      title="Ctrl+B"
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg text-fg-muted transition-all duration-150 hover:border-border-strong hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className={`transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
        aria-hidden
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
    </button>
  );
}

function SectionHeader({
  label,
  isOpen,
  onToggle,
  collapsed,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  collapsed: boolean;
}) {
  if (!label) return null;
  if (collapsed)
    return (
      <div className="mt-4 mb-2 flex justify-center">
        <div className="h-px w-8 bg-border" />
      </div>
    );
  return (
    <button
      onClick={onToggle}
      className="mt-4 mb-1 flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle transition-colors hover:text-fg-muted"
    >
      <span>{label}</span>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        aria-hidden
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

function childActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
function itemActive(item: NavItem, pathname: string): boolean {
  if (item.children?.some((c) => childActive(c.href, pathname))) return true;
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

function NavItemRow({
  item,
  collapsed,
  open,
  onToggleChildren,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  open: boolean;
  onToggleChildren: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = itemActive(item, pathname);
  const hasChildren = (item.children?.length ?? 0) > 0;
  return (
    <div>
      <div
        className={`flex items-center rounded-lg transition-all duration-150 ${active ? "bg-accent-subtle text-accent shadow-[inset_2px_0_0_var(--color-accent)]" : "text-fg-muted hover:bg-bg-subtle hover:text-fg"} ${collapsed ? "justify-center" : ""}`}
      >
        <Link
          href={item.href}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          className={`flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm font-medium ${collapsed ? "justify-center px-2" : ""}`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="shrink-0"
            aria-hidden
          >
            <path d={item.icon} />
          </svg>
          {!collapsed && <span className="truncate">{item.label}</span>}
        </Link>
        {hasChildren && !collapsed && (
          <button
            onClick={onToggleChildren}
            aria-label={
              open ? `Collapse ${item.label}` : `Expand ${item.label}`
            }
            className="px-2 py-2 text-fg-subtle transition-colors hover:text-fg"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>
      {hasChildren && !collapsed && (
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="ml-[22px] space-y-0.5 border-l border-border py-1 pl-3">
                {item.children!.map((c) => {
                  const cActive = childActive(c.href, pathname);
                  return (
                    <Link
                      key={c.href}
                      href={c.href}
                      onClick={onNavigate}
                      className={`block rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ${cActive ? "bg-accent-subtle text-accent" : "text-fg-muted hover:bg-bg-subtle hover:text-fg"}`}
                    >
                      {c.label}
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

function NavList({
  sections,
  collapsed,
  onNavigate,
  openSections,
  toggleSection,
  openItems,
  toggleItem,
}: {
  sections: NavSection[];
  collapsed: boolean;
  onNavigate?: () => void;
  openSections: Record<string, boolean>;
  toggleSection: (id: string) => void;
  openItems: Record<string, boolean>;
  toggleItem: (href: string) => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3">
      {sections.map((section) => {
        const isOpen = openSections[section.id] !== false;
        return (
          <div key={section.id} className={section.label ? "mb-1" : ""}>
            <SectionHeader
              label={section.label}
              isOpen={isOpen}
              onToggle={() => toggleSection(section.id)}
              collapsed={collapsed}
            />
            {(!section.label || isOpen || collapsed) && (
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavItemRow
                    key={item.href}
                    item={item}
                    collapsed={collapsed}
                    open={openItems[item.href] !== false}
                    onToggleChildren={() => toggleItem(item.href)}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function ProfileBlock({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="border-t border-border p-3">
      <ProfileMenu collapsed={collapsed} />
    </div>
  );
}

export function Sidebar() {
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } =
    useSidebar();
  const pathname = usePathname();
  const [isDeveloper, setIsDeveloper] = useState(false);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => {
      const s: Record<string, boolean> = {};
      navSections.forEach((x) => (s[x.id] = true));
      return s;
    },
  );
  const [openItems, setOpenItems] = useState<Record<string, boolean>>(() => {
    const s: Record<string, boolean> = {};
    navSections.forEach((sec) =>
      sec.items.forEach((i) => {
        if (i.children) s[i.href] = true;
      }),
    );
    return s;
  });

  useEffect(() => {
    getDevMe()
      .then((m) => setIsDeveloper(m.is_developer))
      .catch(() => setIsDeveloper(false));
  }, []);

  // Filter: hide items with devOnly=true when user is not developer.
  const visibleSections = useMemo(() => {
    return navSections
      .map((sec) => ({
        ...sec,
        items: sec.items
          .filter((it) => (it.devOnly ? isDeveloper : true))
          .map((it) => ({
            ...it,
            children: it.children?.filter((c) =>
              c.devOnly ? isDeveloper : true,
            ),
          }))
          .filter((it) => !it.devOnly || it.children?.length || true),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [isDeveloper]);

  useEffect(() => {
    setOpenSections(() => {
      const s: Record<string, boolean> = {};
      navSections.forEach((sec) => {
        const stored = window.localStorage.getItem(
          `stockkit.sidebar.${sec.id}`,
        );
        s[sec.id] = stored === null ? true : stored === "1";
      });
      return s;
    });
    setOpenItems(() => {
      const s: Record<string, boolean> = {};
      navSections.forEach((sec) =>
        sec.items.forEach((i) => {
          if (i.children) {
            const stored = window.localStorage.getItem(
              `stockkit.nav.${i.href}`,
            );
            s[i.href] = stored === null ? true : stored === "1";
          }
        }),
      );
      return s;
    });
  }, []);

  useEffect(() => {
    const activeSec = visibleSections.find((sec) =>
      sec.items.some((i) => itemActive(i, pathname)),
    );
    if (activeSec) {
      setOpenSections((prev) => {
        if (prev[activeSec.id] !== false) return prev;
        window.localStorage.setItem(`stockkit.sidebar.${activeSec.id}`, "1");
        return { ...prev, [activeSec.id]: true };
      });
    }
    visibleSections.forEach((sec) =>
      sec.items.forEach((i) => {
        if (i.children?.some((c) => childActive(c.href, pathname))) {
          setOpenItems((prev) => {
            if (prev[i.href] !== false) return prev;
            window.localStorage.setItem(`stockkit.nav.${i.href}`, "1");
            return { ...prev, [i.href]: true };
          });
        }
      }),
    );
  }, [pathname, visibleSections]);

  const toggleSection = (id: string) =>
    setOpenSections((prev) => {
      const n = prev[id] !== false ? false : true;
      window.localStorage.setItem(`stockkit.sidebar.${id}`, n ? "1" : "0");
      return { ...prev, [id]: n };
    });
  const toggleItem = (href: string) =>
    setOpenItems((prev) => {
      const n = prev[href] !== false ? false : true;
      window.localStorage.setItem(`stockkit.nav.${href}`, n ? "1" : "0");
      return { ...prev, [href]: n };
    });

  const desktop = (
    <aside
      className={`sidebar-surface hidden shrink-0 flex-col border-r border-border transition-[width] duration-200 md:flex ${collapsed ? "w-[72px]" : "w-64"}`}
    >
      <div
        className={`flex h-16 items-center border-b border-border ${collapsed ? "justify-center gap-0 px-2" : "gap-2.5 px-4"}`}
      >
        <LogoMark size={28} />
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-base font-semibold tracking-tight text-fg">
              StockKit
            </span>
            <CollapseToggle collapsed={collapsed} onClick={toggleCollapsed} />
          </>
        )}
      </div>
      <NavList
        sections={visibleSections}
        collapsed={collapsed}
        openSections={openSections}
        toggleSection={toggleSection}
        openItems={openItems}
        toggleItem={toggleItem}
      />
      {collapsed && (
        <div className="flex justify-center border-t border-border p-3">
          <CollapseToggle collapsed={collapsed} onClick={toggleCollapsed} />
        </div>
      )}
      <ProfileBlock collapsed={collapsed} />
    </aside>
  );

  const mobile = (
    <AnimatePresence>
      {mobileOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-[#0B0D10]/55 backdrop-blur-[2px] md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
          />
          <motion.aside
            className="sidebar-surface fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border md:hidden"
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <div className="flex h-16 items-center gap-2.5 border-b border-border px-4">
              <LogoMark size={28} />
              <span className="flex-1 text-base font-semibold tracking-tight text-fg">
                StockKit
              </span>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="rounded-lg p-2 text-fg-muted hover:bg-bg-subtle hover:text-fg"
              >
                <svg
                  width="16"
                  height="16"
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
            <NavList
              sections={visibleSections}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
              openSections={openSections}
              toggleSection={toggleSection}
              openItems={openItems}
              toggleItem={toggleItem}
            />
            <ProfileBlock collapsed={false} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {desktop}
      {mobile}
    </>
  );
}
