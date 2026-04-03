"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { formatCallbackDa, isCallbackOverdue } from "@/lib/callback-datetime";

type CallbackLead = {
  id: string;
  companyName: string;
  phone: string;
  notes: string;
  callbackScheduledFor: string;
  callbackStatus: string;
  callbackNote: string;
  campaign: { id: string; name: string } | null;
  callbackReservedByUser: { id: string; name: string; username: string } | null;
};

const HOUR_START = 8;
const HOUR_END = 22;
const HOURS = HOUR_END - HOUR_START + 1;
/** Skal matche den faktiske højde af uge-kolonne-header (to linjer + padding). */
const WEEK_GRID_HEADER_HEIGHT_PX = 56;

/** Ugevisning: fuld ugedag (STORE BOGSTAVER) + «30. marts» på dansk — ingen forkortelser eller 30.3. */
function formatWeekColumnHeaderDa(d: Date): { weekday: string; dayMonth: string } {
  const weekday = d.toLocaleDateString("da-DK", { weekday: "long" }).toUpperCase();
  const dayMonth = d.toLocaleDateString("da-DK", { day: "numeric", month: "long" });
  return { weekday, dayMonth };
}

function startOfWeekMon(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function TilbagekaldKalenderPage() {
  const { data: session, status: authStatus } = useSession();
  const role = session?.user?.role ?? "";
  const myId = session?.user?.id ?? "";
  const [view, setView] = useState<"list" | "week" | "month">("list");
  const [items, setItems] = useState<CallbackLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortFuture, setSortFuture] = useState<"asc" | "desc">("asc");
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeekMon(new Date()));
  const [monthAnchor, setMonthAnchor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [forUserId, setForUserId] = useState<string>("");
  const [userOptions, setUserOptions] = useState<{ id: string; name: string; username: string }[]>([]);
  const [tick, setTick] = useState(0);

  const fetchUrl = useMemo(() => {
    if (!myId) return "";
    const u = new URLSearchParams();
    if (role === "ADMIN" && forUserId.trim()) u.set("forUserId", forUserId.trim());
    const q = u.toString();
    return `/api/callbacks${q ? `?${q}` : ""}`;
  }, [myId, role, forUserId]);

  const load = useCallback(async () => {
    if (!fetchUrl) return;
    setLoading(true);
    setError(null);
    const res = await fetch(fetchUrl);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke hente tilbagekald.");
      setItems([]);
      setLoading(false);
      return;
    }
    setItems(await res.json());
    setLoading(false);
  }, [fetchUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (role !== "ADMIN") return;
    void (async () => {
      const r = await fetch("/api/users/for-assignment");
      if (r.ok) setUserOptions(await r.json());
    })();
  }, [role]);

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const { overdue, future } = useMemo(() => {
    const o: CallbackLead[] = [];
    const f: CallbackLead[] = [];
    for (const it of items) {
      const t = new Date(it.callbackScheduledFor);
      if (isCallbackOverdue(t, it.callbackStatus)) o.push(it);
      else f.push(it);
    }
    o.sort((a, b) => new Date(a.callbackScheduledFor).getTime() - new Date(b.callbackScheduledFor).getTime());
    f.sort((a, b) => {
      const ta = new Date(a.callbackScheduledFor).getTime();
      const tb = new Date(b.callbackScheduledFor).getTime();
      return sortFuture === "asc" ? ta - tb : tb - ta;
    });
    return { overdue: o, future: f };
  }, [items, sortFuture, tick]);

  async function markComplete(leadId: string) {
    const res = await fetch(`/api/leads/${leadId}/callback`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete" }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(typeof j.error === "string" ? j.error : "Kunne ikke lukke tilbagekald.");
      return;
    }
    void load();
  }

  const now = new Date();
  const nowMinutesFromStart = now.getHours() * 60 + now.getMinutes() - HOUR_START * 60;
  const nowWindowMinutes = (HOUR_END - HOUR_START) * 60;
  const nowLinePct = (nowMinutesFromStart / nowWindowMinutes) * 100;
  const showNowLine = nowLinePct >= 0 && nowLinePct <= 100;

  const weekDays = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 5; i++) out.push(addDays(weekAnchor, i));
    return out;
  }, [weekAnchor]);

  const monthCells = useMemo(() => {
    const y = monthAnchor.getFullYear();
    const m = monthAnchor.getMonth();
    const first = new Date(y, m, 1);
    const start = startOfWeekMon(first);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) cells.push(addDays(start, i));
    return cells;
  }, [monthAnchor]);

  const countsByDayKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const d = new Date(it.callbackScheduledFor);
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [items]);

  if (authStatus === "loading") {
    return <div className="py-12 text-center text-stone-500">Henter…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Tilbagekald & Kalender</h1>
          <p className="mt-1 text-sm text-stone-600">
            Planlagte tilbagekald tildelt dig. Format: {formatCallbackDa(new Date())}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-stone-200 bg-stone-50 p-0.5">
            {(
              [
                ["list", "Liste"],
                ["week", "Uge"],
                ["month", "Måned"],
              ] as const
            ).map(([k, lab]) => (
              <button
                key={k}
                type="button"
                onClick={() => setView(k)}
                className={
                  view === k
                    ? "rounded-md bg-white px-3 py-1.5 text-sm font-medium text-stone-900 shadow-sm"
                    : "rounded-md px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900"
                }
              >
                {lab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {role === "ADMIN" && userOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
          <label className="text-xs font-medium text-stone-600">
            Vis for bruger (admin)
            <select
              value={forUserId}
              onChange={(e) => setForUserId(e.target.value)}
              className="ml-2 rounded-md border border-stone-200 px-2 py-1 text-sm"
            >
              <option value="">Mig selv</option>
              {userOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-stone-500">Henter tilbagekald…</p>}

      {view === "list" && !loading && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Fremtidige — sortering
            </p>
            <button
              type="button"
              onClick={() => setSortFuture((s) => (s === "asc" ? "desc" : "asc"))}
              className="text-sm font-medium text-violet-800 hover:underline"
            >
              {sortFuture === "asc" ? "Tidligst først" : "Senest først"} — skift
            </button>
          </div>

          {overdue.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-800">
                <span aria-hidden>⚠</span> Overskredet
              </h2>
              <ul className="space-y-3">
                {overdue.map((it) => (
                  <CallbackCard key={it.id} item={it} overdue onComplete={() => void markComplete(it.id)} />
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold text-stone-800">Kommende</h2>
            {future.length === 0 && overdue.length === 0 ? (
              <p className="text-sm text-stone-500">Ingen planlagte tilbagekald.</p>
            ) : (
              <ul className="space-y-3">
                {future.map((it) => (
                  <CallbackCard key={it.id} item={it} overdue={false} onComplete={() => void markComplete(it.id)} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {view === "week" && !loading && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setWeekAnchor((w) => addDays(w, -7))}
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm hover:bg-stone-50"
            >
              ← Forrige uge
            </button>
            <span className="text-sm font-medium text-stone-700">
              Uge {formatCallbackDa(weekAnchor).split(" kl.")[0]} –{" "}
              {formatCallbackDa(addDays(weekAnchor, 4)).split(" kl.")[0]}
            </span>
            <button
              type="button"
              onClick={() => setWeekAnchor((w) => addDays(w, 7))}
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm hover:bg-stone-50"
            >
              Næste uge →
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="relative min-w-[720px]">
              <div className="grid" style={{ gridTemplateColumns: `4.5rem repeat(5, 1fr)` }}>
                <div className="border-b border-r border-slate-200 bg-slate-50/80" />
                {weekDays.map((d, i) => {
                  const { weekday, dayMonth } = formatWeekColumnHeaderDa(d);
                  return (
                    <div
                      key={i}
                      className="flex min-h-[3.5rem] flex-col items-center justify-center gap-1 border-b border-r border-slate-200 bg-slate-50/80 px-2 py-2.5 text-center"
                    >
                      <span className="text-[11px] font-medium uppercase leading-tight tracking-wide text-slate-500">
                        {weekday}
                      </span>
                      <span className="text-sm font-semibold leading-snug text-slate-900">{dayMonth}</span>
                    </div>
                  );
                })}

                {Array.from({ length: HOURS }, (_, hi) => HOUR_START + hi).map((hour) => (
                  <Fragment key={hour}>
                    <div className="border-b border-r border-slate-200 bg-white py-2 pr-2 text-right text-xs text-slate-500">
                      {String(hour).padStart(2, "0")}:00
                    </div>
                    {weekDays.map((day, di) => {
                      const slotItems = items.filter((it) => {
                        const t = new Date(it.callbackScheduledFor);
                        return sameDay(t, day) && t.getHours() === hour;
                      });
                      return (
                        <div
                          key={`${hour}-${di}`}
                          className="relative min-h-[52px] border-b border-r border-slate-200 bg-white"
                        >
                          {slotItems.map((it) => (
                            <Link
                              key={it.id}
                              href={`/leads/${it.id}`}
                              className="mb-0.5 block truncate rounded border border-violet-200 bg-violet-50 px-1 py-0.5 text-[10px] font-medium text-violet-950 hover:bg-violet-100"
                            >
                              {it.companyName} · {formatCallbackDa(it.callbackScheduledFor).split("kl. ")[1]}
                            </Link>
                          ))}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>

              {showNowLine && weekDays.some((d) => sameDay(d, now)) ? (
                <WeekNowLine weekDays={weekDays} now={now} nowLinePct={nowLinePct} />
              ) : null}
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Ugevisning: man–fre, {HOUR_START}:00–{HOUR_END}:00. Rød linje = omtrent nu (kun hvis i dag er i ugen).
          </p>
        </div>
      )}

      {view === "month" && !loading && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() =>
                setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
              }
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm hover:bg-stone-50"
            >
              ← Forrige måned
            </button>
            <span className="text-sm font-medium text-stone-800">
              {monthAnchor.toLocaleString("da-DK", { month: "long", year: "numeric" })}
            </span>
            <button
              type="button"
              onClick={() =>
                setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
              }
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm hover:bg-stone-50"
            >
              Næste måned →
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-stone-500">
            {["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthCells.map((d) => {
              const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
              const n = countsByDayKey.get(k) ?? 0;
              const inMonth = d.getMonth() === monthAnchor.getMonth();
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setWeekAnchor(startOfWeekMon(d));
                    setView("week");
                  }}
                  className={[
                    "min-h-[3.5rem] rounded-lg border p-1 text-left text-sm transition",
                    inMonth ? "border-stone-200 bg-white hover:bg-violet-50" : "border-transparent bg-stone-50/50 text-stone-400",
                    n > 0 ? "ring-1 ring-violet-300" : "",
                  ].join(" ")}
                >
                  <span className="font-medium">{d.getDate()}</span>
                  {n > 0 && (
                    <span className="mt-1 block text-[10px] font-semibold text-violet-800">{n} tilbagekald</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Rød «nu»-linje på den kolonne der matcher dagens dato. */
function WeekNowLine({
  weekDays,
  now,
  nowLinePct,
}: {
  weekDays: Date[];
  now: Date;
  nowLinePct: number;
}) {
  const col = weekDays.findIndex((d) => sameDay(d, now));
  if (col < 0) return null;
  const headerH = WEEK_GRID_HEADER_HEIGHT_PX;
  const rowH = 52;
  const bodyH = HOURS * rowH;
  const top = headerH + (nowLinePct / 100) * bodyH;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl">
      <div
        className="absolute h-0.5 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]"
        style={{
          left: `calc(4.5rem + ((100% - 4.5rem) / 5) * ${col})`,
          width: "calc((100% - 4.5rem) / 5)",
          top: `${top}px`,
        }}
      />
    </div>
  );
}

function CallbackCard({
  item,
  overdue,
  onComplete,
}: {
  item: CallbackLead;
  overdue: boolean;
  onComplete: () => void;
}) {
  const notePreview = item.callbackNote?.trim() || item.notes?.trim().slice(0, 120) || "—";
  const assignee = item.callbackReservedByUser;

  return (
    <li
      className={[
        "rounded-xl border p-4 shadow-sm transition",
        overdue
          ? "border-red-300 bg-red-50/90"
          : "border-stone-200 bg-white hover:border-violet-200",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/leads/${item.id}`} className="font-semibold text-stone-900 hover:underline">
              {item.companyName}
            </Link>
            {overdue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                Overskredet
              </span>
            )}
          </div>
          <p className={`mt-1 text-sm ${overdue ? "font-semibold text-red-900" : "text-stone-700"}`}>
            {formatCallbackDa(item.callbackScheduledFor)}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Kampagne: {item.campaign?.name ?? "Ingen kampagne"}
            {assignee && (
              <>
                {" · "}
                Tildelt: {assignee.name}
              </>
            )}
          </p>
          {item.phone ? (
            <p className="mt-0.5 text-xs text-stone-600">Tlf. {item.phone}</p>
          ) : null}
          <p className="mt-2 line-clamp-2 text-xs text-stone-600">{notePreview}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Link
            href={`/leads/${item.id}`}
            className="rounded-lg bg-stone-900 px-3 py-1.5 text-center text-xs font-medium text-white hover:bg-stone-800"
          >
            Åbn lead
          </Link>
          <button
            type="button"
            onClick={onComplete}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50"
          >
            Marker håndteret
          </button>
        </div>
      </div>
    </li>
  );
}
