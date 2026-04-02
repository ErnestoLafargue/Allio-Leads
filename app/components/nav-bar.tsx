"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const links: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: "/kampagner", label: "Kampagner" },
  { href: "/leads", label: "Leads" },
  { href: "/tilbagekald-kalender", label: "Tilbagekald & Kalender" },
  { href: "/meetings", label: "Møder" },
  { href: "/mine-salg", label: "Mine Salg" },
  { href: "/scoreboard", label: "Scoreboard" },
  { href: "/import", label: "Opret & Import", adminOnly: true },
  { href: "/indstillinger", label: "Indstillinger", adminOnly: true },
];

export function NavBar({
  userName,
  role,
}: {
  userName: string;
  role: string;
}) {
  const pathname = usePathname();

  return (
    <header className="border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/kampagner" className="text-sm font-semibold tracking-tight text-stone-800">
            Allio Leads
          </Link>
          <nav className="flex flex-wrap gap-1">
            {links
              .filter((l) => !l.adminOnly || role === "ADMIN")
              .map((l) => {
                const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={
                      active
                        ? "rounded-md bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-900"
                        : "rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                    }
                  >
                    {l.label}
                  </Link>
                );
              })}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-stone-600">
          <span className="hidden sm:inline">{userName}</span>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
            {role === "ADMIN" ? "Admin" : "Sælger"}
          </span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-stone-700 hover:bg-stone-50"
          >
            Log ud
          </button>
        </div>
      </div>
    </header>
  );
}
