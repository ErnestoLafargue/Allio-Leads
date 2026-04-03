"use client";

import { useEffect, useState } from "react";
import { isCallbackTimeInCopenhagenBusinessWindow } from "@/lib/callback-datetime";

export type CallbackSchedulePayload = {
  assignedUserId: string;
  scheduledForISO: string;
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

/** 08:00–22:00 inkl., 15-minutters trin (København vises som lokal dato+tids-valg). */
const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 8; h <= 22; h++) {
    const maxM = h === 22 ? 0 : 45;
    for (let m = 0; m <= maxM; m += 15) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
})();

function defaultDateParts(): { date: string; time: string } {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 60, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const mo = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  let H = d.getHours();
  let M = d.getMinutes();
  M = Math.ceil(M / 15) * 15;
  if (M >= 60) {
    H += 1;
    M = 0;
  }
  if (H < 8) {
    H = 8;
    M = 0;
  }
  if (H > 22 || (H === 22 && M > 0)) {
    H = 22;
    M = 0;
  }
  const time = `${pad(H)}:${pad(M)}`;
  return { date: `${y}-${mo}-${day}`, time: TIME_OPTIONS.includes(time) ? time : "09:00" };
}

export function CallbackScheduleDialog({
  open,
  title = "Planlæg tilbagekald",
  description = "Vælg hvem der skal ringe tilbage, og hvornår (08:00–22:00). Noter på leadet bruges som udgangspunkt — der tilføjes ikke separat callback-note.",
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
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const { date, time } = defaultDateParts();
    setDateStr(date);
    setTimeStr(time);
    setAssignedUserId(currentUserId);
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
    if (!isCallbackTimeInCopenhagenBusinessWindow(local)) return;
    onConfirm({
      assignedUserId,
      scheduledForISO: local.toISOString(),
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
            className="mt-1 w-full appearance-none rounded-lg border border-stone-200 bg-white bg-[length:1rem] bg-[right_0.5rem_center] bg-no-repeat px-3 py-2.5 pr-9 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2357534e'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
            }}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
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
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600">
            Tid (08:00–22:00)
            <select
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="mt-1 w-full appearance-none rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

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
            className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-800 disabled:opacity-60"
          >
            {saving ? "Gemmer…" : "Bekræft tilbagekald"}
          </button>
        </div>
      </div>
    </div>
  );
}
