"use client";

import { useEffect, useState } from "react";

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

type Props = {
  open: boolean;
  mode: "create" | "edit";
  initial?: BlockedTimeDto | null;
  currentUserId: string;
  isAdmin: boolean;
  defaultUserId?: string | null;
  saving: boolean;
  errorText: string | null;
  onClose: () => void;
  onSaved: () => void;
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

function partsFromIso(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { date: "", time: "09:00" };
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const h = d.getHours();
  const m = Math.round(d.getMinutes() / 15) * 15;
  const time = `${pad(h)}:${pad(m === 60 ? 0 : m)}`;
  return { date, time: TIME_OPTIONS.includes(time) ? time : "09:00" };
}

function defaultRange(): {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
} {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 60, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  let h = d.getHours();
  let m = Math.ceil(d.getMinutes() / 15) * 15;
  if (m >= 60) {
    h += 1;
    m = 0;
  }
  const startTime = `${pad(Math.min(h, 21))}:${pad(m)}`;
  const endH = Math.min(h + 1, 22);
  const endTime = endH === 22 ? "22:00" : `${pad(endH)}:${pad(m)}`;
  return {
    startDate: date,
    startTime: TIME_OPTIONS.includes(startTime) ? startTime : "09:00",
    endDate: date,
    endTime: TIME_OPTIONS.includes(endTime) ? endTime : "10:00",
  };
}

function toIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function BlockedTimeDialog({
  open,
  mode,
  initial,
  currentUserId,
  isAdmin,
  defaultUserId,
  saving,
  errorText,
  onClose,
  onSaved,
}: Props) {
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [userId, setUserId] = useState(currentUserId);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("10:00");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadErr(null);
    setSubmitErr(null);
    void (async () => {
      const res = await fetch("/api/users/meeting-assignees");
      if (!res.ok) {
        setLoadErr("Kunne ikke hente mødeansvarlige.");
        return;
      }
      const data = (await res.json()) as { users: Assignee[]; defaultUserId: string | null };
      setAssignees(data.users ?? []);
      if (mode === "edit" && initial) {
        setUserId(initial.userId);
        setTitle(initial.title);
        const s = partsFromIso(initial.startDateTime);
        const e = partsFromIso(initial.endDateTime);
        setStartDate(s.date);
        setStartTime(s.time);
        setEndDate(e.date);
        setEndTime(e.time);
      } else {
        const range = defaultRange();
        setStartDate(range.startDate);
        setStartTime(range.startTime);
        setEndDate(range.endDate);
        setEndTime(range.endTime);
        setTitle("");
        setUserId(
          isAdmin && defaultUserId ? defaultUserId : currentUserId,
        );
      }
    })();
  }, [open, mode, initial, currentUserId, isAdmin, defaultUserId]);

  if (!open) return null;

  async function handleSave() {
    setSubmitErr(null);
    const startIso = toIso(startDate, startTime);
    const endIso = toIso(endDate, endTime);
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

    const res =
      mode === "edit" && initial
        ? await fetch(`/api/blocked-times/${initial.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/blocked-times", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setSubmitErr(typeof j.error === "string" ? j.error : "Kunne ikke gemme blokering.");
      return;
    }
    onSaved();
  }

  async function handleDelete() {
    if (!initial || mode !== "edit") return;
    if (!window.confirm("Slet denne blokering?")) return;
    setDeleting(true);
    setSubmitErr(null);
    const res = await fetch(`/api/blocked-times/${initial.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setSubmitErr(typeof j.error === "string" ? j.error : "Kunne ikke slette.");
      return;
    }
    onSaved();
  }

  const showUserSelect = isAdmin && assignees.length > 0;

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

        {(loadErr || errorText || submitErr) && (
          <p className="mt-3 text-sm text-red-600">{submitErr ?? errorText ?? loadErr}</p>
        )}

        {showUserSelect ? (
          <label className="mt-4 block text-xs font-medium text-stone-600">
            Mødeansvarlig
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
            >
              {assignees.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.username})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="mt-4 text-xs text-stone-500">Blokering gælder din egen kalender.</p>
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
