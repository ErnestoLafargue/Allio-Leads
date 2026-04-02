"use client";

import { useEffect, useState } from "react";

export type CallbackSchedulePayload = {
  assignedUserId: string;
  scheduledForISO: string;
  note: string;
};

type UserOpt = { id: string; name: string; username: string; role: string };

type Props = {
  open: boolean;
  title?: string;
  description?: string;
  currentUserId: string;
  saving: boolean;
  errorText: string | null;
  onClose: () => void;
  onConfirm: (p: CallbackSchedulePayload) => void;
};

function defaultDateParts() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 60, 0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  const iso = local.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function CallbackScheduleDialog({
  open,
  title = "Planlæg tilbagekald",
  description = "Vælg hvem der skal ringe tilbage, og hvornår. Leadet reserveres til den valgte bruger.",
  currentUserId,
  saving,
  errorText,
  onClose,
  onConfirm,
}: Props) {
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [assignedUserId, setAssignedUserId] = useState(currentUserId);
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [note, setNote] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const { date, time } = defaultDateParts();
    setDateStr(date);
    setTimeStr(time);
    setAssignedUserId(currentUserId);
    setNote("");
    setLoadErr(null);
    void (async () => {
      const res = await fetch("/api/users/for-assignment");
      if (!res.ok) {
        setLoadErr("Kunne ikke hente brugerliste.");
        return;
      }
      const list = (await res.json()) as UserOpt[];
      setUsers(list);
    })();
  }, [open, currentUserId]);

  if (!open) return null;

  function submit() {
    if (!dateStr || !timeStr) return;
    const local = new Date(`${dateStr}T${timeStr}:00`);
    if (Number.isNaN(local.getTime())) return;
    onConfirm({
      assignedUserId,
      scheduledForISO: local.toISOString(),
      note: note.trim(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="callback-schedule-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
        <h2 id="callback-schedule-title" className="text-lg font-semibold text-stone-900">
          {title}
        </h2>
        <p className="mt-1 text-sm text-stone-600">{description}</p>

        {(loadErr || errorText) && (
          <p className="mt-3 text-sm text-red-600">{errorText ?? loadErr}</p>
        )}

        <label className="mt-4 block text-xs font-medium text-stone-600">
          Tildelt bruger
          <select
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.username})
                {u.role === "ADMIN" ? " · Admin" : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-stone-600">
            Dato
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600">
            Tid (tt:mm)
            <input
              type="time"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900"
            />
          </label>
        </div>

        <label className="mt-4 block text-xs font-medium text-stone-600">
          Note (valgfri)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1 w-full resize-y rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900"
            placeholder="Kort note til tilbagekaldet…"
          />
        </label>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
            onClick={onClose}
          >
            Annuller
          </button>
          <button
            type="button"
            disabled={saving || !dateStr || !timeStr || users.length === 0}
            onClick={submit}
            className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
          >
            {saving ? "Gemmer…" : "Bekræft tilbagekald"}
          </button>
        </div>
      </div>
    </div>
  );
}
