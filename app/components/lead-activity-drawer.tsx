"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LeadRecordingPlayer } from "@/app/components/lead-recording-player";

export type DrawerActivityItem = {
  kind: "visit" | "note" | "call" | "call_attempt" | "outcome" | "callback_schedule";
  at: string;
  summary: string;
  user: { name: string; username: string } | null;
  recordingUrl: string | null;
  durationSeconds: number | null;
};

type Props = {
  leadId: string;
  isOpen: boolean;
  onClose: () => void;
  /** Inkrementér efter f.eks. nyt opkald eller gemt udfald, så listen henter igen */
  reloadToken?: number;
  /** Skjul backdrop (hvis caller selv vil styre dimningen) */
  hideBackdrop?: boolean;
};

type TabKey = "timeline" | "notes" | "calls" | "messages";

const TABS: { id: TabKey; label: string; placeholder?: boolean }[] = [
  { id: "timeline", label: "Tidslinje" },
  { id: "notes", label: "Noter" },
  { id: "calls", label: "Opkald" },
  { id: "messages", label: "Beskeder", placeholder: true },
];

const AVATAR_PALETTE = [
  "bg-emerald-100 text-emerald-800 ring-emerald-200",
  "bg-sky-100 text-sky-800 ring-sky-200",
  "bg-violet-100 text-violet-800 ring-violet-200",
  "bg-amber-100 text-amber-800 ring-amber-200",
  "bg-rose-100 text-rose-800 ring-rose-200",
  "bg-teal-100 text-teal-800 ring-teal-200",
  "bg-indigo-100 text-indigo-800 ring-indigo-200",
];

function hashStringToIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % mod;
}

function initialsFromName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function startOfDayKey(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
    .getDate()
    .toString()
    .padStart(2, "0")}`;
}

function dayHeading(d: Date, today: Date): string {
  const todayKey = startOfDayKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = startOfDayKey(yesterday);
  const dKey = startOfDayKey(d);
  if (dKey === todayKey) return "I dag";
  if (dKey === yKey) return "I går";
  return d.toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(seconds: number | null): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s} sek.`;
  return `${m} min ${s.toString().padStart(2, "0")} sek.`;
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
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
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.8 12.8 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.8 12.8 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function NoteIcon({ className }: { className?: string }) {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="42"
      height="42"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function eventIcon(kind: DrawerActivityItem["kind"]): React.ReactNode {
  if (kind === "call" || kind === "call_attempt") {
    return <PhoneIcon className="h-3 w-3 text-emerald-700" />;
  }
  return null;
}

export function LeadActivityDrawer({
  leadId,
  isOpen,
  onClose,
  reloadToken = 0,
  hideBackdrop = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("timeline");
  const [items, setItems] = useState<DrawerActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/leads/${leadId}/activity`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke hente aktivitet.");
      setItems([]);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { items?: DrawerActivityItem[] };
    setItems(Array.isArray(data.items) ? data.items : []);
    setLoading(false);
  }, [leadId]);

  /// Hent kun når drawer åbnes eller når vi får signal om reload (efter call/save).
  useEffect(() => {
    if (!isOpen) return;
    void load();
  }, [isOpen, load, reloadToken]);

  /// Esc lukker drawer.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const filtered = useMemo(() => {
    if (activeTab === "timeline") return items;
    if (activeTab === "notes") return items.filter((i) => i.kind === "note");
    if (activeTab === "calls") {
      return items.filter((i) => i.kind === "call" || i.kind === "call_attempt");
    }
    return [];
  }, [items, activeTab]);

  const grouped = useMemo(() => {
    const today = new Date();
    const groups = new Map<string, DrawerActivityItem[]>();
    for (const it of filtered) {
      const d = new Date(it.at);
      const key = startOfDayKey(d);
      const arr = groups.get(key) ?? [];
      arr.push(it);
      groups.set(key, arr);
    }
    return Array.from(groups.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, list]) => ({
        key,
        heading: dayHeading(new Date(list[0]!.at), today),
        items: list,
      }));
  }, [filtered]);

  const counts = useMemo(() => {
    let notes = 0;
    let calls = 0;
    for (const i of items) {
      if (i.kind === "note") notes += 1;
      if (i.kind === "call" || i.kind === "call_attempt") calls += 1;
    }
    return { all: items.length, notes, calls };
  }, [items]);

  return (
    <>
      {/* Backdrop */}
      {!hideBackdrop && (
        <div
          aria-hidden
          onClick={onClose}
          className={[
            "fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[1px] transition-opacity duration-300",
            isOpen ? "opacity-100" : "pointer-events-none opacity-0",
          ].join(" ")}
        />
      )}

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Aktivitet på lead"
        className={[
          "fixed right-0 top-0 z-50 flex h-screen w-full max-w-[440px] flex-col overflow-hidden",
          "border-l border-stone-200 bg-white shadow-2xl shadow-slate-900/20",
          "transition-transform duration-300 ease-out will-change-transform",
          isOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm ring-1 ring-emerald-700/20"
              aria-hidden
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </span>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-stone-900">Aktivitet</h2>
              <p className="text-[11px] text-stone-500">Komplet historik for leadet</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Luk aktivitet"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
          >
            <CloseIcon />
          </button>
        </header>

        {/* Tabs */}
        <div className="shrink-0 border-b border-stone-100 px-3 py-2">
          <div role="tablist" aria-label="Aktivitetsfiltre" className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((t) => {
              const active = activeTab === t.id;
              const count =
                t.id === "timeline"
                  ? counts.all
                  : t.id === "notes"
                    ? counts.notes
                    : t.id === "calls"
                      ? counts.calls
                      : undefined;
              return (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  aria-controls={`activity-tabpanel-${t.id}`}
                  onClick={() => setActiveTab(t.id)}
                  className={[
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                    active
                      ? "bg-stone-900 text-white"
                      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
                  ].join(" ")}
                >
                  {t.label}
                  {typeof count === "number" && !t.placeholder ? (
                    <span
                      className={[
                        "ml-0.5 rounded-md px-1.5 text-[10px] font-semibold tabular-nums",
                        active ? "bg-white/15 text-white" : "bg-stone-100 text-stone-600",
                      ].join(" ")}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div
          role="tabpanel"
          id={`activity-tabpanel-${activeTab}`}
          className="min-h-0 flex-1 overflow-y-auto bg-stone-50/40"
        >
          {activeTab === "messages" ? (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center px-6 text-center">
              <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-400">
                <ChatIcon className="h-7 w-7" />
              </span>
              <p className="text-sm font-medium text-stone-700">Beskeder kommer snart</p>
              <p className="mt-1 max-w-[18rem] text-xs text-stone-500">
                Når SMS/email-kommunikation er rullet ud, vises tråden her sammen med opkald og noter.
              </p>
            </div>
          ) : loading && items.length === 0 ? (
            <div className="px-5 py-6">
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex animate-pulse gap-3 rounded-xl bg-white p-3 ring-1 ring-stone-100"
                  >
                    <div className="h-9 w-9 rounded-full bg-stone-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 rounded bg-stone-100" />
                      <div className="h-2.5 w-1/3 rounded bg-stone-100" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : error ? (
            <div className="px-5 py-6">
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm hover:bg-stone-50"
              >
                Prøv igen
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-medium text-stone-700">
                {activeTab === "notes"
                  ? "Ingen noter endnu"
                  : activeTab === "calls"
                    ? "Ingen opkald endnu"
                    : "Ingen aktivitet endnu"}
              </p>
              <p className="mt-1 max-w-[18rem] text-xs text-stone-500">
                Aktivitet bliver registreret automatisk, når du arbejder med leadet.
              </p>
            </div>
          ) : (
            <div className="px-3 py-3">
              {grouped.map((group, gi) => (
                <section key={group.key} className={gi > 0 ? "mt-4" : undefined}>
                  <h3 className="sticky top-0 z-10 -mx-3 mb-2 bg-stone-50/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-500 backdrop-blur-sm">
                    {group.heading}
                  </h3>
                  <ul className="space-y-2">
                    {group.items.map((row, idx) => {
                      const isNewest = gi === 0 && idx === 0;
                      const userName = row.user?.name ?? "System";
                      const initials = initialsFromName(userName);
                      const palette = AVATAR_PALETTE[hashStringToIndex(userName, AVATAR_PALETTE.length)]!;
                      const time = formatTime(new Date(row.at));
                      const duration = formatDuration(row.durationSeconds);
                      const isCallish = row.kind === "call" || row.kind === "call_attempt";
                      return (
                        <li
                          key={`${row.at}-${idx}`}
                          className={[
                            "rounded-xl bg-white p-3 ring-1 ring-stone-100 transition-shadow",
                            isNewest ? "shadow-sm ring-emerald-200/70" : "",
                          ].join(" ")}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={[
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1",
                                palette,
                              ].join(" ")}
                              aria-hidden
                            >
                              {initials}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <p className="truncate text-sm font-medium text-stone-900">
                                  {userName}
                                </p>
                                <span className="text-[11px] tabular-nums text-stone-500">{time}</span>
                              </div>
                              <p className="mt-0.5 text-[13px] leading-snug text-stone-700">
                                {row.summary}
                              </p>
                              {isCallish && duration ? (
                                <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800">
                                  {eventIcon(row.kind)} Varighed {duration}
                                </p>
                              ) : null}
                              {row.kind === "call" && row.recordingUrl ? (
                                <LeadRecordingPlayer
                                  key={row.recordingUrl}
                                  src={row.recordingUrl}
                                  durationSecondsHint={row.durationSeconds}
                                  variant="default"
                                />
                              ) : null}
                              {row.kind === "call" && !row.recordingUrl ? (
                                <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-stone-500">
                                  <PhoneIcon className="h-3 w-3 opacity-70" />
                                  Optagelse er ikke tilgængelig endnu.
                                </p>
                              ) : null}
                              {row.kind === "note" && (
                                <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-stone-500">
                                  <NoteIcon className="h-3 w-3 opacity-70" />
                                  Note opdateret
                                </p>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-stone-100 bg-white px-5 py-2.5 text-[11px] text-stone-500">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="font-medium text-stone-600 underline-offset-2 hover:text-stone-900 hover:underline disabled:opacity-50"
          >
            {loading ? "Opdaterer…" : "Opdater listen"}
          </button>
        </div>
      </aside>
    </>
  );
}
