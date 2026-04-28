"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; matches?: (pathname: string) => boolean };

const TABS: Tab[] = [
  {
    href: "/kampagner",
    label: "Start",
    matches: (p) => p === "/kampagner" || p === "/" || p.startsWith("/kampagner"),
  },
  { href: "/tilbagekald-kalender", label: "Tilbagekald" },
  { href: "/historik", label: "Historik" },
  { href: "/mine-salg", label: "Mine salg" },
];

function StartIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.8 12.8 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.8 12.8 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

export function DashboardTabs() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Sælgerflow"
      className="-mx-4 mb-4 flex items-center gap-1 overflow-x-auto border-b border-stone-200 px-4 py-1 sm:mx-0 sm:rounded-xl sm:border sm:border-stone-200/90 sm:bg-white sm:px-2 sm:py-1.5 sm:shadow-sm"
    >
      {TABS.map((t) => {
        const active = t.matches ? t.matches(pathname) : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={[
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-stone-900 text-white shadow-sm"
                : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
            ].join(" ")}
          >
            {t.label === "Start" ? <StartIcon className="h-4 w-4 opacity-90" /> : null}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
