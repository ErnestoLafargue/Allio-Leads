"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";

const links: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: "/kampagner", label: "Kampagner" },
  { href: "/historik", label: "Historik" },
  { href: "/leads", label: "Leads" },
  { href: "/tilbagekald-kalender", label: "Tilbagekald & Kalender" },
  { href: "/meetings", label: "Møder" },
  { href: "/mine-salg", label: "Mine Salg" },
  { href: "/scoreboard", label: "Scoreboard" },
  { href: "/import", label: "Opret & Import", adminOnly: true },
  { href: "/indstillinger", label: "Indstillinger", adminOnly: true },
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

export function NavBar({
  userName,
  role,
}: {
  userName: string;
  role: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleLinks = links.filter((l) => !l.adminOnly || role === "ADMIN");
  const roleLabel = role === "ADMIN" ? "Admin" : "Sælger";
  const initial = (userName.trim().charAt(0) || "?").toUpperCase();

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const navLinkClass = (active: boolean) =>
    active
      ? "bg-stone-900 text-white shadow-md shadow-stone-900/15"
      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 active:scale-[0.98]";

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/90 bg-white/95 shadow-[0_1px_0_rgba(0,0,0,0.04)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:gap-4 sm:py-3">
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 lg:hidden"
            aria-expanded={mobileOpen}
            aria-controls="mobile-primary-nav"
            onClick={() => setMobileOpen((o) => !o)}
          >
            <span className="sr-only">{mobileOpen ? "Luk menu" : "Åbn menu"}</span>
            <MenuIcon open={mobileOpen} />
          </button>

          <Link
            href="/kampagner"
            className="group flex items-center gap-2.5 rounded-xl py-1 pr-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-sm font-bold text-white shadow-sm ring-1 ring-emerald-700/20 transition group-hover:shadow-md">
              A
            </span>
            <span className="hidden min-[380px]:block">
              <span className="block text-sm font-semibold leading-tight tracking-tight text-stone-900">
                Allio Leads
              </span>
              <span className="block text-[11px] font-medium text-stone-500">Arbejdskø og salg</span>
            </span>
          </Link>
        </div>

        <nav
          className="hidden min-w-0 flex-1 items-center lg:flex"
          aria-label="Hovednavigation"
        >
          <div className="flex w-full min-w-0 justify-center px-2">
            <ul className="flex max-w-full items-center gap-0.5 overflow-x-auto py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {visibleLinks.map((l) => {
                const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
                return (
                  <li key={l.href} className="shrink-0">
                    <Link
                      href={l.href}
                      className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${navLinkClass(active)}`}
                    >
                      {l.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <div
            className="hidden h-9 w-px bg-stone-200 sm:block lg:hidden"
            aria-hidden
          />
          <div className="flex items-center gap-2 rounded-2xl border border-stone-200/90 bg-gradient-to-b from-white to-stone-50/90 py-1 pl-1 pr-1 shadow-sm sm:pl-2">
            <div
              className="hidden items-center gap-2 sm:flex"
              title={userName}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700">
                {initial}
              </span>
              <div className="max-w-[10rem] truncate lg:max-w-[12rem]">
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
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
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
        <nav className="mx-auto max-w-6xl px-4 py-3" aria-label="Mobil navigation">
          <ul className="grid gap-1 sm:grid-cols-2">
            {visibleLinks.map((l) => {
              const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={`block rounded-xl px-4 py-3 text-sm font-medium transition ${navLinkClass(active)}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
