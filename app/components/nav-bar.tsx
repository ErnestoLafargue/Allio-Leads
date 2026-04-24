"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

type NavItem = { href: string; label: string };

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
};

const KAMPAGNER: NavItem = { href: "/kampagner", label: "Kampagner" };

const NAV_GROUPS: NavGroup[] = [
  {
    id: "salg",
    label: "Salg & kø",
    items: [
      { href: "/historik", label: "Historik" },
      { href: "/leads", label: "Leads" },
      { href: "/mine-salg", label: "Mine Salg" },
      { href: "/scoreboard", label: "Scoreboard" },
    ],
  },
  {
    id: "plan",
    label: "Planlægning",
    items: [
      { href: "/tilbagekald-kalender", label: "Tilbagekald & Kalender" },
      { href: "/meetings", label: "Møder" },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    adminOnly: true,
    items: [
      { href: "/import", label: "Opret & Import" },
      { href: "/indstillinger", label: "Indstillinger" },
      { href: "/administration/telnyx", label: "Telnyx" },
      { href: "/administration/dialer", label: "Dialer" },
      { href: "/administration/cost", label: "Cost" },
    ],
  },
];

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      {open ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      )}
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function NavBar({
  userName,
  role,
}: {
  userName: string;
  role: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const desktopNavRef = useRef<HTMLElement>(null);

  const isAdmin = role === "ADMIN";
  const visibleGroups = NAV_GROUPS.filter((g) => !g.adminOnly || isAdmin);
  const roleLabel = isAdmin ? "Admin" : "Sælger";
  const initial = (userName.trim().charAt(0) || "?").toUpperCase();

  const linkActive = useCallback(
    (href: string) => pathname === href || pathname.startsWith(`${href}/`),
    [pathname],
  );

  const groupActive = useCallback(
    (items: NavItem[]) => items.some((it) => linkActive(it.href)),
    [linkActive],
  );

  useEffect(() => {
    if (!mobileOpen && openMenuId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setOpenMenuId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, openMenuId]);

  useEffect(() => {
    if (openMenuId === null) return;
    const onPointerDown = (e: MouseEvent | PointerEvent) => {
      const el = desktopNavRef.current;
      if (el && !el.contains(e.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [openMenuId]);

  const navLinkClass = (active: boolean) =>
    active
      ? "bg-stone-900 text-white shadow-md shadow-stone-900/15"
      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 active:scale-[0.98]";

  const dropdownItemClass = (active: boolean) =>
    active
      ? "bg-stone-900 text-white"
      : "text-stone-700 hover:bg-stone-100 hover:text-stone-900";

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/90 bg-white/95 shadow-[0_1px_0_rgba(0,0,0,0.04)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 lg:hidden"
            aria-expanded={mobileOpen}
            aria-controls="mobile-primary-nav"
            onClick={() => setMobileOpen((o) => !o)}
          >
            <span className="sr-only">{mobileOpen ? "Luk menu" : "Åbn menu"}</span>
            <MenuIcon open={mobileOpen} />
          </button>

          <Link
            href="/kampagner"
            className="group flex min-w-0 items-center gap-2 rounded-xl py-1 pr-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:gap-2.5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-sm font-bold text-white shadow-sm ring-1 ring-emerald-700/20 transition group-hover:shadow-md">
              A
            </span>
            <span className="hidden min-[360px]:block">
              <span className="block text-sm font-semibold leading-tight tracking-tight text-stone-900">
                Allio Leads
              </span>
              <span className="hidden text-[11px] font-medium text-stone-500 sm:block">
                Arbejdskø og salg
              </span>
            </span>
          </Link>
        </div>

        <nav
          ref={desktopNavRef}
          className="hidden min-w-0 flex-1 items-center gap-0.5 lg:flex"
          aria-label="Hovednavigation"
        >
          <Link
            href={KAMPAGNER.href}
            className={`shrink-0 rounded-lg px-2.5 py-2 text-sm font-medium transition sm:px-3 ${navLinkClass(linkActive(KAMPAGNER.href))}`}
          >
            {KAMPAGNER.label}
          </Link>

          {visibleGroups.map((group) => {
            const open = openMenuId === group.id;
            const parentActive = groupActive(group.items);
            return (
              <div key={group.id} className="relative shrink-0">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-haspopup="menu"
                  aria-controls={`nav-menu-${group.id}`}
                  onClick={() => setOpenMenuId((id) => (id === group.id ? null : group.id))}
                  className={[
                    "flex items-center gap-0.5 rounded-lg px-2.5 py-2 text-sm font-medium transition sm:px-3",
                    open || parentActive
                      ? "bg-stone-200/90 text-stone-900 ring-1 ring-stone-200"
                      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
                  ].join(" ")}
                >
                  {group.label}
                  <ChevronDown
                    className={`shrink-0 opacity-70 transition ${open ? "rotate-180" : ""}`}
                  />
                </button>
                {open ? (
                  <div
                    id={`nav-menu-${group.id}`}
                    role="menu"
                    className="absolute left-0 top-full z-50 mt-1 min-w-[13.5rem] rounded-xl border border-stone-200 bg-white py-1 shadow-lg shadow-stone-900/10 ring-1 ring-black/5"
                  >
                    {group.items.map((it) => {
                      const active = linkActive(it.href);
                      return (
                        <Link
                          key={it.href}
                          href={it.href}
                          role="menuitem"
                          className={`block px-3 py-2 text-sm font-medium transition ${dropdownItemClass(active)}`}
                          onClick={() => setOpenMenuId(null)}
                        >
                          {it.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden h-9 w-px bg-stone-200 sm:block lg:hidden" aria-hidden />
          <div className="flex items-center gap-1.5 rounded-2xl border border-stone-200/90 bg-gradient-to-b from-white to-stone-50/90 py-1 pl-1 pr-1 shadow-sm sm:gap-2 sm:pl-2">
            <div className="hidden items-center gap-2 sm:flex" title={userName}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700">
                {initial}
              </span>
              <div className="max-w-[7rem] truncate xl:max-w-[11rem]">
                <p className="truncate text-sm font-medium leading-tight text-stone-900">{userName}</p>
                <p className="text-[11px] font-medium text-stone-500">{roleLabel}</p>
              </div>
            </div>
            <span className="rounded-full bg-stone-900/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-600 sm:hidden">
              {roleLabel}
            </span>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="shrink-0 rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-xs font-medium text-stone-800 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 sm:px-3 sm:text-sm"
            >
              Log ud
            </button>
          </div>
        </div>
      </div>

      <div
        id="mobile-primary-nav"
        className={`border-t border-stone-100 bg-stone-50/95 lg:hidden ${mobileOpen ? "block" : "hidden"}`}
      >
        <nav className="mx-auto max-w-6xl space-y-4 px-4 py-4" aria-label="Mobil navigation">
          <section>
            <h2 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              Kampagne
            </h2>
            <Link
              href={KAMPAGNER.href}
              className={`block rounded-xl px-4 py-3 text-sm font-medium transition ${navLinkClass(linkActive(KAMPAGNER.href))}`}
              onClick={() => setMobileOpen(false)}
            >
              {KAMPAGNER.label}
            </Link>
          </section>
          {visibleGroups.map((group) => (
            <section key={group.id}>
              <h2 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                {group.label}
              </h2>
              <ul className="grid gap-1 sm:grid-cols-2">
                {group.items.map((it) => {
                  const active = linkActive(it.href);
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        className={`block rounded-xl px-4 py-3 text-sm font-medium transition ${navLinkClass(active)}`}
                        onClick={() => setMobileOpen(false)}
                      >
                        {it.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
      </div>
    </header>
  );
}
