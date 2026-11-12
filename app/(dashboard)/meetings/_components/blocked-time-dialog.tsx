"use client";

import { useState } from "react";
import { copenhagenWallTimeToUtc } from "@/lib/copenhagen-day";
import { defaultBlockedTimeAssignee } from "@/lib/blocked-time-calendar";
import { copenhagenParts } from "@/lib/meeting-week-calendar";

export type BlockedTimeDto = {
  id: string;
  userId: string;
  title: string;
  startDateTime: string;
  endDateTime: string;
  createdByUserId: string;
  user?: { id: string; name: string; username: string };
};

type Assignee = { id: string; name: string; username: string };

export type BlockedTimeCreatePrefill = {
  /** YYYY-MM-DD (Europe/Copenhagen). */
  startDate: string;
  /** HH:mm — 15-min gitter. */
  startTime: string;
};

type Props = {
  mode: "create" | "edit";
  initial?: BlockedTimeDto | null;
  /** Ved create: forudfyld start (fx fra klik i kalenderen). Slut = start + 60 min. */
  createPrefill?: BlockedTimeCreatePrefill | null;
  /** Ved create: sælgeren man klikkede hos («Pr. sælger»-kolonne eller eneste synlige sælger). */
  preferredUserId?: string | null;
  currentUserId: string;
  /** Kørende sælgere (hentet af kalenderen). */
  assignees: Assignee[];
  defaultUserId?: string | null;
  onClose: () => void;
  /** Kaldes efter gem (med den gemte blokering) eller slet (null). */
  onSaved: (saved: BlockedTimeDto | null) => void;
};

const TITLE_PRESETS = ["Frokost", "Ferie", "Internt møde", "Optaget", "Ikke tilgængelig"] as const;

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 9; h <= 22; h++) {
    const maxM = h === 22 ? 0 : 45;
    for (let m = 0; m <= maxM; m += 15) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
})();

const pad = (n: number) => String(n).padStart(2, "0");

/** Dato og tid i dansk tid (kalenderen viser Europe/Copenhagen uanset computerens tidszone). */
function partsFromIso(iso: string): { date: string; time: string } {
  const p = copenhagenParts(iso);
  if (!p) return { date: "", time: "09:00" };
  const m = Math.round(p.minute / 15) * 15;
  const time = `${pad(p.hour)}:${pad(m === 60 ? 0 : m)}`;
  return { date: p.dayKey, time: TIME_OPTIONS.includes(time) ? time : "09:00" };
}

function addOneHour(time: string): string {
  const [hs, ms] = time.split(":").map(Number);
  const h = (hs ?? 9) + 1;
  const m = ms ?? 0;
  if (h > 22 || (h === 22 && m > 0)) return "22:00";
  const end = `${pad(h)}:${pad(m)}`;
  return TIME_OPTIONS.includes(end) ? end : "22:00";
}

type FormRange = { startDate: string; startTime: string; endDate: string; endTime: string };

function rangeFromPrefill(prefill: { startDate: string; startTime: string }): FormRange {
  const startTime = TIME_OPTIONS.includes(prefill.startTime) ? prefill.startTime : "09:00";
  return {
    startDate: prefill.startDate,
    startTime,
    endDate: prefill.startDate,
    endTime: addOneHour(startTime),
  };
}

/** Næste hele kvarter om ca. en time (dansk tid). */
function defaultRange(): FormRange {
  const p = copenhagenParts(new Date(Date.now() + 60 * 60 * 1000));
  if (!p) return rangeFromPrefill({ startDate: "", startTime: "09:00" });
  let h = p.hour;
  let m = Math.ceil(p.minute / 15) * 15;
  if (m >= 60) {
    h += 1;
    m = 0;
  }
  const startTime = `${pad(Math.min(h, 21))}:${pad(m)}`;
  return rangeFromPrefill({ startDate: p.dayKey, startTime: TIME_OPTIONS.includes(startTime) ? startTime : "09:00" });
}

function toIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  return copenhagenWallTimeToUtc(date, time)?.toISOString() ?? null;
}

/** Monteres kun mens den er åben, så formularen altid starter forfra. */
export function BlockedTimeDialog({
  mode,
  initial,
  createPrefill = null,
  preferredUserId,
  currentUserId,
  assignees,
  defaultUserId,
  onClose,
  onSaved,
}: Props) {
  const editing = mode === "edit" && initial ? initial : null;
  const [initialRange] = useState<FormRange>(() => {
    if (editing) {
      const s = partsFromIso(editing.startDateTime);
      const e = partsFromIso(editing.endDateTime);
      return { startDate: s.date, startTime: s.time, endDate: e.date, endTime: e.time };
    }
    return createPrefill ? rangeFromPrefill(createPrefill) : defaultRange();
  });
  const [chosenUserId, setChosenUserId] = useState(editing?.userId ?? "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [startTime, setStartTime] = useState(initialRange.startTime);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [endTime, setEndTime] = useState(initialRange.endTime);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sælgerlisten kan komme lidt efter, at dialogen åbnes — standarden udledes ved render.
  const userId =
    chosenUserId || defaultBlockedTimeAssignee(assignees, preferredUserId, currentUserId, defaultUserId);

  async function handleSave() {
    if (saving) return;
    setSubmitErr(null);
    const startIso = toIso(startDate, startTime);
    const endIso = toIso(endDate, endTime);
    if (!userId) {
      setSubmitErr("Vælg mødeansvarlig.");
      return;
    }
    if (!title.trim()) {
      setSubmitErr("Angiv en titel/årsag.");
      return;
    }
    if (!startIso || !endIso) {
      setSubmitErr("Angiv gyldig start- og sluttid.");
      return;
    }
    if (new Date(endIso) <= new Date(startIso)) {
      setSubmitErr("Sluttid skal være efter starttid.");
      return;
    }

    const body = {
      userId,
      title: title.trim(),
      startDateTime: startIso,
      endDateTime: endIso,
    };

    setSaving(true);
    try {
      const res = editing
        ? await fetch(`/api/blocked-times/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/blocked-times", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const j = (await res.json().catch(() => ({}))) as { error?: unknown; blockedTime?: BlockedTimeDto };
      if (!res.ok) {
        setSubmitErr(typeof j.error === "string" ? j.error : "Kunne ikke gemme blokering.");
        setSaving(false);
        return;
      }
      onSaved(j.blockedTime ?? null);
    } catch {
      setSubmitErr("Kunne ikke gemme blokering — tjek forbindelsen og prøv igen.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    if (!window.confirm("Slet denne blokering?")) return;
    setDeleting(true);
    setSubmitErr(null);
    const res = await fetch(`/api/blocked-times/${editing.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setSubmitErr(typeof j.error === "string" ? j.error : "Kunne ikke slette.");
      return;
    }
    onSaved(null);
  }

  const showUserSelect = assignees.length > 0;
  // Ved redigering kan blokeringens ejer mangle i listen (fx ikke længere kørende sælger) — vis den alligevel.
  const selectOptions =
    editing?.user && !assignees.some((u) => u.id === editing.user!.id)
      ? [...assignees, editing.user]
      : assignees;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="blocked-time-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
        <h2 id="blocked-time-title" className="text-lg font-semibold text-stone-900">
          {mode === "edit" ? "Rediger blokering" : "Bloker tider"}
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Blokerede perioder vises i kalenderen og fjernes fra ledige booking-tider for den valgte
          mødeansvarlige.
        </p>

        {submitErr && <p className="mt-3 text-sm text-red-600">{submitErr}</p>}

        {showUserSelect ? (
          <label className="mt-4 block text-xs font-medium text-stone-600">
            Mødeansvarlig
            <select
              value={userId}
              onChange={(e) => setChosenUserId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
            >
              {!userId ? <option value="">Vælg mødeansvarlig…</option> : null}
              {selectOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="mt-4 text-xs text-stone-500">Henter mødeansvarlige…</p>
        )}

        <label className="mt-4 block text-xs font-medium text-stone-600">
          Titel / årsag
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
            placeholder="Fx frokost, ferie…"
          />
        </label>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {TITLE_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setTitle(p)}
              className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
            >
              {p}
            </button>
          ))}
        </div>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-stone-500">Start</p>
        <div className="mt-1 grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-stone-600">
            Dato
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-stone-400 focus:ring-2"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600">
            Tid
            <select
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-stone-400 focus:ring-2"
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-stone-500">Slut</p>
        <div className="mt-1 grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-stone-600">
            Dato
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-stone-400 focus:ring-2"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600">
            Tid
            <select
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-stone-400 focus:ring-2"
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 flex flex-wrap justify-between gap-2">
          {mode === "edit" ? (
            <button
              type="button"
              disabled={saving || deleting}
              onClick={() => void handleDelete()}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
            >
              {deleting ? "Sletter…" : "Slet"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
              onClick={onClose}
            >
              Annuller
            </button>
            <button
              type="button"
              disabled={saving || deleting}
              onClick={() => void handleSave()}
              className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-900 disabled:opacity-50"
            >
              {saving ? "Gemmer…" : "Gem"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
