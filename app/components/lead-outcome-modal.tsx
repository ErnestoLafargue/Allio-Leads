"use client";

import { useEffect, useState } from "react";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/lead-status";
import { OUTCOME_ORDER, outcomeButtonClass } from "@/lib/lead-outcome-ui";
import {
  getAvailableCopenhagenBookingSlots,
  parseOccupiedBlocksFromApi,
} from "@/lib/booking/availability";
import { toCopenhagenDateKey } from "@/lib/booking/mock-availability";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Ét eller flere leads — samme udfald sættes for alle ved flere valg. */
  leadIds: string[];
  initialStatus: LeadStatus;
  /** værdi til datetime-local input */
  initialMeetingLocal: string;
  /** Ved ét lead + møde booket: send med så API kan validere mødekontakt. */
  meetingContactSnapshot?: { name: string; email: string; phone: string };
  /** Ved ét lead sendes serverens lead-objekt; ved flere kaldes uden argument. */
  onSaved: (data?: Record<string, unknown>) => void;
};

export function LeadOutcomeModal({
  open,
  onClose,
  leadIds,
  initialStatus,
  initialMeetingLocal,
  meetingContactSnapshot,
  onSaved,
}: Props) {
  const [draftStatus, setDraftStatus] = useState<LeadStatus>(initialStatus);
  const [draftMeeting, setDraftMeeting] = useState(initialMeetingLocal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = leadIds.length;
  const single = count === 1;

  useEffect(() => {
    if (!open) return;
    setDraftStatus(initialStatus);
    setDraftMeeting(initialMeetingLocal);
    setError(null);
  }, [open, initialStatus, initialMeetingLocal]);

  async function isMeetingTimeSelectable(meetingIso: string): Promise<boolean> {
    const dt = new Date(meetingIso);
    if (Number.isNaN(dt.getTime())) return false;
    const dayKey = toCopenhagenDateKey(dt);
    const qs = new URLSearchParams({ date: dayKey });
    if (single && leadIds[0]) {
      qs.set("excludeLeadId", leadIds[0]);
    }
    const res = await fetch(`/api/booking/availability?${qs.toString()}`);
    if (!res.ok) return false;
    const payload = (await res.json().catch(() => ({}))) as {
      blocks?: { start: string; end: string }[];
    };
    const occupied = parseOccupiedBlocksFromApi(Array.isArray(payload.blocks) ? payload.blocks : []);
    const available = getAvailableCopenhagenBookingSlots(dayKey, occupied);
    return available.some((s) => Math.abs(s.utcMs - dt.getTime()) < 90_000);
  }

  async function save() {
    if (draftStatus === "MEETING_BOOKED" && !draftMeeting.trim()) {
      setError("Vælg dato og tid for mødet.");
      return;
    }
    setSaving(true);
    setError(null);

    const meetingIso =
      draftStatus === "MEETING_BOOKED" && draftMeeting.trim()
        ? new Date(draftMeeting).toISOString()
        : undefined;
    if (draftStatus === "MEETING_BOOKED" && meetingIso) {
      const selectable = await isMeetingTimeSelectable(meetingIso);
      if (!selectable) {
        setSaving(false);
        setError(
          "Det valgte mødetidspunkt overlapper buffer-reglen (75 min før / 75 min efter) eller er ikke længere ledigt. Vælg en ledig tid i kalenderen.",
        );
        return;
      }
    }

    if (single) {
      const body: Record<string, unknown> = { status: draftStatus };
      if (draftStatus === "MEETING_BOOKED" && meetingIso) {
        body.meetingScheduledFor = meetingIso;
        if (meetingContactSnapshot) {
          body.meetingContactName = meetingContactSnapshot.name.trim();
          body.meetingContactEmail = meetingContactSnapshot.email.trim();
          body.meetingContactPhonePrivate = meetingContactSnapshot.phone.trim();
        }
      }
      const res = await fetch(`/api/leads/${leadIds[0]}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSaving(false);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(typeof j.error === "string" ? j.error : "Kunne ikke gemme udfald");
        return;
      }
      const data = (await res.json()) as Record<string, unknown>;
      onSaved(data);
      onClose();
      return;
    }

    const res = await fetch("/api/leads/bulk-outcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: leadIds,
        status: draftStatus,
        ...(draftStatus === "MEETING_BOOKED" && meetingIso ? { meetingScheduledFor: meetingIso } : {}),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke gemme udfald");
      return;
    }
    onSaved();
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-outcome-modal-title"
      onClick={() => !saving && onClose()}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-xl border-2 border-stone-300 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="lead-outcome-modal-title" className="text-lg font-semibold text-stone-900">
          {single ? "Ændre udfald" : `Ændre udfald (${count} leads)`}
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          {single ? (
            <>
              Vælg udfald som på kampagne-siden. Ændres leadet fra «Ikke interesseret» til noget andet, kan det igen
              vises i opkaldskøen.
            </>
          ) : (
            <>
              Alle valgte leads får det samme udfald. Ved «Møde booket» bruges én dato/tid for alle. Ændring fra «Ikke
              interesseret» m.m. kan få leads tilbage i opkaldskøen.
            </>
          )}
        </p>
        <div className="mt-4 flex flex-wrap gap-2 sm:gap-3">
          {OUTCOME_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setDraftStatus(s)}
              className={outcomeButtonClass(s, draftStatus === s)}
            >
              {LEAD_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        {draftStatus === "MEETING_BOOKED" && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
            <label className="block text-xs font-medium text-emerald-900">Møde tid (påkrævet)</label>
            <input
              type="datetime-local"
              value={draftMeeting}
              onChange={(e) => setDraftMeeting(e.target.value)}
              className="mt-2 w-full max-w-sm rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-emerald-400 focus:ring-2"
            />
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setError(null);
              onClose();
            }}
            className="rounded-md border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Annuller
          </button>
          <button
            type="button"
            disabled={saving || count === 0}
            onClick={() => void save()}
            className="rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-60"
          >
            {saving ? "Gemmer…" : single ? "Gem udfald" : `Gem for ${count} leads`}
          </button>
        </div>
      </div>
    </div>
  );
}
