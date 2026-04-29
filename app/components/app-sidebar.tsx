"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

type LeafItem = { href: string; label: string };

type SidebarSection =
  | {
      kind: "link";
      id: string;
      href: string;
      label: string;
      icon: (props: { className?: string }) => React.ReactElement;
    }
  | {
      kind: "group";
      id: string;
      label: string;
      icon: (props: { className?: string }) => React.ReactElement;
      adminOnly?: boolean;
      items: LeafItem[];
    };

function DialerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
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

function LeadsGroupIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function ScoreboardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 3v18h18" />
      <path d="M7 14l3-3 3 3 5-5" />
    </svg>
  );
}

function MeetingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function TicketsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M9 6v12" strokeDasharray="2 3" />
    </svg>
  );
}

function AdminIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.55V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.04 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.55 1Z" />
    </svg>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

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

const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    kind: "link",
    id: "dialer",
    href: "/kampagner",
    label: "Dialer",
    icon: DialerIcon,
  },
  {
    kind: "link",
    id: "scoreboard",
    href: "/scoreboard",
    label: "Scoreboard",
    icon: ScoreboardIcon,
  },
  {
    kind: "group",
    id: "leads",
    label: "Leads",
    icon: LeadsGroupIcon,
    items: [
      { href: "/leads", label: "Leads" },
      { href: "/leads/lydfiler", label: "Lydfiler" },
    ],
  },
  {
    kind: "group",
    id: "meetings",
    label: "Møder",
    icon: MeetingsIcon,
    items: [
      { href: "/meetings/new", label: "Nyt møde" },
      { href: "/meetings/upcoming", label: "Kommende møder" },
      { href: "/meetings/past", label: "Tidligere møder" },
    ],
  },
  {
    kind: "link",
    id: "tickets",
    href: "/tickets",
    label: "Tickets",
    icon: TicketsIcon,
  },
  {
    kind: "group",
    id: "admin",
    label: "Administration",
    icon: AdminIcon,
    adminOnly: true,
    items: [
      { href: "/import", label: "Opret & Import" },
      { href: "/users", label: "Brugere" },
      { href: "/indstillinger", label: "Indstillinger" },
      { href: "/administration/telnyx", label: "Telnyx" },
      { href: "/administration/dialer", label: "Dialer" },
      { href: "/administration/cost", label: "Cost" },
    ],
  },
];

export function AppSidebar({
  userName,
  role,
}: {
  userName: string;
  role: string;
}) {
  const pathname = usePathname();
  const [hovered, setHovered] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [meetingsOpen, setMeetingsOpen] = useState(false);
  const [leadsOpen, setLeadsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = role === "ADMIN";
  const visibleSections = useMemo(
    () => SIDEBAR_SECTIONS.filter((s) => (s.kind === "link" ? true : !s.adminOnly || isAdmin)),
    [isAdmin],
  );

  const linkActive = useCallback(
    (href: string) => pathname === href || pathname.startsWith(`${href}/`),
    [pathname],
  );

  const adminActive = useMemo(
    () =>
      visibleSections
        .filter((s): s is Extract<SidebarSection, { kind: "group" }> => s.kind === "group")
        .filter((g) => g.id === "admin")
        .some((g) => g.items.some((it) => linkActive(it.href))),
    [visibleSections, linkActive],
  );

  const meetingsActive = useMemo(() => linkActive("/meetings"), [linkActive]);

  const leadsActive = useMemo(() => (pathname ?? "").startsWith("/leads"), [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const expanded = hovered;
  const initial = (userName.trim().charAt(0) || "?").toUpperCase();
  const roleLabel = isAdmin ? "Admin" : "Sælger";

  const baseRowClass =
    "group/row relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors";

  return (
    <>
      {/* Mobile topbar (lg-down) */}
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-stone-200/90 bg-white/95 px-3 py-2 shadow-[0_1px_0_rgba(0,0,0,0.04)] backdrop-blur-md lg:hidden">
        <button
          type="button"
          aria-label={mobileOpen ? "Luk menu" : "Åbn menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50"
        >
          <MenuIcon open={mobileOpen} />
        </button>
        <Link href="/kampagner" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-sm font-bold text-white shadow-sm ring-1 ring-emerald-700/20">
            A
          </span>
          <span className="text-sm font-semibold text-stone-900">Allio Leads</span>
        </Link>
      </header>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal>
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] overflow-y-auto bg-gradient-to-b from-emerald-950 via-slate-900 to-slate-950 p-3 text-stone-100 shadow-2xl">
            <div className="mb-4 flex items-center gap-3 px-2 pt-1">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-md ring-1 ring-emerald-400/30">
                A
              </span>
              <span className="text-base font-semibold tracking-tight">Allio Leads</span>
            </div>
            <nav className="flex flex-col gap-1" aria-label="Mobil hovednavigation">
              {visibleSections.map((s) => {
                if (s.kind === "link") {
                  const active = linkActive(s.href);
                  const Icon = s.icon;
                  return (
                    <Link
                      key={s.id}
                      href={s.href}
                      onClick={() => setMobileOpen(false)}
                      className={[
                        baseRowClass,
                        active
                          ? "bg-white/10 text-white shadow-inner shadow-emerald-400/10"
                          : "text-stone-200/90 hover:bg-white/5 hover:text-white",
                      ].join(" ")}
                    >
                      {active ? (
                        <span
                          className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-emerald-400"
                          aria-hidden
                        />
                      ) : null}
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="truncate">{s.label}</span>
                    </Link>
                  );
                }
                const Icon = s.icon;
                const isAdminGroup = s.id === "admin";
                const isMeetingsGroup = s.id === "meetings";
                const isLeadsGroup = s.id === "leads";
                const open = isAdminGroup
                  ? adminOpen || adminActive
                  : isMeetingsGroup
                    ? meetingsOpen || meetingsActive
                    : isLeadsGroup
                      ? leadsOpen || leadsActive
                      : false;
                return (
                  <div key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isAdminGroup) setAdminOpen((v) => !v);
                        if (isMeetingsGroup) setMeetingsOpen((v) => !v);
                        if (isLeadsGroup) setLeadsOpen((v) => !v);
                      }}
                      aria-expanded={open}
                      className={[
                        baseRowClass,
                        "w-full",
                        open
                          ? "bg-white/10 text-white"
                          : "text-stone-200/90 hover:bg-white/5 hover:text-white",
                      ].join(" ")}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="flex-1 truncate text-left">{s.label}</span>
                      <ChevronRight
                        className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
                      />
                    </button>
                    {open ? (
                      <ul className="mb-1 mt-1 ml-3 space-y-0.5 border-l border-white/10 pl-3">
                        {s.items.map((it) => {
                          const active = linkActive(it.href);
                          return (
                            <li key={it.href}>
                              <Link
                                href={it.href}
                                onClick={() => setMobileOpen(false)}
                                className={[
                                  "block rounded-md px-3 py-2 text-sm transition-colors",
                                  active
                                    ? "bg-white/10 font-medium text-white"
                                    : "text-stone-300/80 hover:bg-white/5 hover:text-white",
                                ].join(" ")}
                              >
                                {it.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </nav>
            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="flex items-center gap-3 px-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{userName}</p>
                  <p className="text-[11px] text-stone-300/80">{roleLabel}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="mt-2 w-full rounded-lg bg-white/5 px-3 py-2 text-sm font-medium text-stone-100 transition-colors hover:bg-white/10"
              >
                Log ud
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {/* Desktop sidebar (lg+) */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          if (!adminActive) setAdminOpen(false);
          if (!meetingsActive) setMeetingsOpen(false);
          if (!leadsActive) setLeadsOpen(false);
        }}
        onFocus={() => setHovered(true)}
        onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setHovered(false);
            if (!adminActive) setAdminOpen(false);
            if (!meetingsActive) setMeetingsOpen(false);
            if (!leadsActive) setLeadsOpen(false);
          }
        }}
        aria-label="Hovednavigation"
        className={[
          "fixed left-0 top-0 z-40 hidden h-screen flex-col overflow-hidden",
          "bg-gradient-to-b from-emerald-950 via-slate-900 to-slate-950 text-stone-100",
          "shadow-[2px_0_12px_rgba(2,6,23,0.35)] lg:flex",
          "transition-[width] duration-300 ease-out",
          expanded ? "w-60" : "w-16",
        ].join(" ")}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center gap-3 px-3">
          <Link
            href="/kampagner"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-md ring-1 ring-emerald-400/30 transition hover:shadow-lg"
            aria-label="Allio Leads — Start"
          >
            A
          </Link>
          <span
            className={[
              "min-w-0 flex-1 select-none truncate text-base font-semibold tracking-tight transition-opacity duration-200",
              expanded ? "opacity-100" : "pointer-events-none opacity-0",
            ].join(" ")}
          >
            Allio Leads
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-1 px-2 pt-2">
          {visibleSections.map((s) => {
            if (s.kind === "link") {
              const active = linkActive(s.href);
              const Icon = s.icon;
              return (
                <Link
                  key={s.id}
                  href={s.href}
                  title={!expanded ? s.label : undefined}
                  className={[
                    baseRowClass,
                    active
                      ? "bg-white/10 text-white"
                      : "text-stone-200/85 hover:bg-white/5 hover:text-white",
                  ].join(" ")}
                >
                  {active ? (
                    <span
                      className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-emerald-400"
                      aria-hidden
                    />
                  ) : null}
                  <Icon className="h-5 w-5 shrink-0" />
                  <span
                    className={[
                      "min-w-0 flex-1 truncate transition-opacity duration-200",
                      expanded ? "opacity-100" : "pointer-events-none opacity-0",
                    ].join(" ")}
                  >
                    {s.label}
                  </span>
                </Link>
              );
            }
            const Icon = s.icon;
            const isAdminGroup = s.id === "admin";
            const isMeetingsGroup = s.id === "meetings";
            const isLeadsGroup = s.id === "leads";
            const groupHighlighted = isAdminGroup
              ? adminActive
              : isMeetingsGroup
                ? meetingsActive
                : isLeadsGroup
                  ? leadsActive
                  : false;
            const open = expanded
              ? isAdminGroup
                ? adminOpen || adminActive
                : isMeetingsGroup
                  ? meetingsOpen || meetingsActive
                  : isLeadsGroup
                    ? leadsOpen || leadsActive
                    : false
              : false;
            return (
              <div key={s.id} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => {
                    if (!expanded) return;
                    if (isAdminGroup) setAdminOpen((v) => !v);
                    if (isMeetingsGroup) setMeetingsOpen((v) => !v);
                    if (isLeadsGroup) setLeadsOpen((v) => !v);
                  }}
                  aria-expanded={open}
                  title={!expanded ? s.label : undefined}
                  className={[
                    baseRowClass,
                    "w-full",
                    groupHighlighted || open
                      ? "bg-white/10 text-white"
                      : "text-stone-200/85 hover:bg-white/5 hover:text-white",
                    !expanded ? "cursor-default" : "",
                  ].join(" ")}
                >
                  {groupHighlighted ? (
                    <span
                      className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-emerald-400"
                      aria-hidden
                    />
                  ) : null}
                  <Icon className="h-5 w-5 shrink-0" />
                  <span
                    className={[
                      "flex-1 truncate text-left transition-opacity duration-200",
                      expanded ? "opacity-100" : "pointer-events-none opacity-0",
                    ].join(" ")}
                  >
                    {s.label}
                  </span>
                  <ChevronRight
                    className={[
                      "h-3.5 w-3.5 shrink-0 transition-all duration-200",
                      expanded ? "opacity-70" : "pointer-events-none opacity-0",
                      open ? "rotate-90" : "",
                    ].join(" ")}
                  />
                </button>
                <div
                  className={[
                    "grid transition-[grid-template-rows] duration-200 ease-out",
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  ].join(" ")}
                >
                  <div className="overflow-hidden">
                    <ul className="mb-1 ml-3 mt-1 space-y-0.5 border-l border-white/10 pl-3">
                      {s.items.map((it) => {
                        const active = linkActive(it.href);
                        return (
                          <li key={it.href}>
                            <Link
                              href={it.href}
                              className={[
                                "block rounded-md px-3 py-2 text-[13px] transition-colors",
                                active
                                  ? "bg-white/10 font-medium text-white"
                                  : "text-stone-300/80 hover:bg-white/5 hover:text-white",
                              ].join(" ")}
                            >
                              {it.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        {/* User panel */}
        <div className="mt-auto border-t border-white/10 px-2 pb-3 pt-3">
          <div
            className="group/user flex items-center gap-3 rounded-lg px-2 py-1.5"
            title={userName}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white ring-1 ring-white/15">
              {initial}
            </span>
            <div
              className={[
                "min-w-0 flex-1 transition-opacity duration-200",
                expanded ? "opacity-100" : "pointer-events-none opacity-0",
              ].join(" ")}
            >
              <p className="truncate text-sm font-medium text-white">{userName}</p>
              <p className="truncate text-[11px] text-stone-300/80">{roleLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title={!expanded ? "Log ud" : undefined}
            className={[
              "mt-1 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              "text-stone-200/85 hover:bg-white/5 hover:text-white",
            ].join(" ")}
          >
            <svg
              className="h-5 w-5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span
              className={[
                "min-w-0 flex-1 truncate text-left transition-opacity duration-200",
                expanded ? "opacity-100" : "pointer-events-none opacity-0",
              ].join(" ")}
            >
              Log ud
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
