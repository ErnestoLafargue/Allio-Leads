"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/indstillinger", label: "Brugere", exact: true },
  { href: "/indstillinger/export", label: "Export" },
];

export function IndstillingerSectionTabs() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Indstillinger"
      className="-mx-4 mb-5 flex items-center gap-1 overflow-x-auto border-b border-stone-200 px-4 py-1 sm:mx-0 sm:rounded-xl sm:border sm:border-stone-200/90 sm:bg-white sm:px-2 sm:py-1.5 sm:shadow-sm"
    >
      {TABS.map((t) => {
        const active = t.exact
          ? pathname === t.href
          : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={[
              "inline-flex shrink-0 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-stone-900 text-white shadow-sm"
                : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
            ].join(" ")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
