"use client";

import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/lead-status";
import { OUTCOME_ORDER, outcomeButtonClass } from "@/lib/lead-outcome-ui";

type BookedBy = { name: string; username: string } | null;

export type LeadOutcomeStripProps = {
  status: LeadStatus;
  onStatusChange: (s: LeadStatus) => void;
  meetingBookedAt: string | null;
  bookedByUser: BookedBy;
  /** Højre side: Gem og næste, Gem ændringer, osv. */
  rightColumn: React.ReactNode;
  /** Fx «Tilbagekald» inline med udfaldsknapperne */
  inlineAfterOutcomes?: React.ReactNode;
  /** Fx aktivitetsmenu — vises mellem «Udfald»-titlen og udfaldsknapperne */
  aboveOutcomeButtons?: React.ReactNode;
};

/**
 * Samme udfaldsbjælke som på kampagne-arbejdsfladen — bruges også på lead-detaljer for ens udseende.
 */
export function LeadOutcomeStrip({
  status,
  onStatusChange,
  meetingBookedAt,
  bookedByUser,
  rightColumn,
  inlineAfterOutcomes,
  aboveOutcomeButtons,
}: LeadOutcomeStripProps) {
  return (
    <div className="shrink-0 space-y-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-lg sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Udfald</p>
          {aboveOutcomeButtons}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {OUTCOME_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onStatusChange(s)}
                className={outcomeButtonClass(s, status === s)}
              >
                {LEAD_STATUS_LABELS[s]}
              </button>
            ))}
            {inlineAfterOutcomes}
          </div>
          {status === "MEETING_BOOKED" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
              <p className="text-xs font-medium text-emerald-900">Møde tid (påkrævet)</p>
              <p className="mt-1 text-xs text-emerald-800/90">
                Vælg dato og tidspunkt i kalenderen nedenfor. Tryk «Bekræft booking» for at gemme og gå videre
                (samme som «Næste»).
              </p>
              {meetingBookedAt && (
                <p className="mt-2 text-xs text-emerald-800">
                  Booket den {new Date(meetingBookedAt).toLocaleString("da-DK")}
                </p>
              )}
              {bookedByUser && (
                <p className="text-xs text-emerald-800">
                  Af {bookedByUser.name} ({bookedByUser.username})
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 lg:shrink-0 lg:pt-6">{rightColumn}</div>
      </div>
    </div>
  );
}
