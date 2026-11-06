"use client";

import { useMemo } from "react";
import { BOOKING_DAY_PARTS, bookingDayPartForTime } from "@/lib/booking/day-parts";

export type BookingTimeSlotEntry = { time: string; busy?: boolean };

export type TimeSlotsProps = {
  slots: BookingTimeSlotEntry[];
  selectedTime: string | null;
  onSelectTime: (time: string) => void;
  /** Vist dato (overskrift) */
  dateLabel: string;
  loading?: boolean;
  /** Admin: optagne tider kan vælges */
  allowSelectBusySlots?: boolean;
};

function formatSlotLabel(isoLike: string): string {
  const [h, m] = isoLike.split(":").map((x) => parseInt(x, 10));
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function BookingTimeSlots({
  slots,
  selectedTime,
  onSelectTime,
  dateLabel,
  loading = false,
  allowSelectBusySlots = false,
}: TimeSlotsProps) {
  const groups = useMemo(
    () =>
      BOOKING_DAY_PARTS.map((part) => ({
        ...part,
        entries: slots.filter((s) => bookingDayPartForTime(s.time) === part.key),
      })),
    [slots],
  );

  return (
    <div className="flex min-h-[240px] min-w-0 flex-1 flex-col border-t border-slate-100 pt-4 lg:mt-0 lg:border-l lg:border-t-0 lg:pt-0 lg:pl-6">
      <h3 className="mb-3 shrink-0 text-sm font-semibold capitalize text-slate-900">{dateLabel}</h3>
      <div className="max-h-[min(420px,60vh)] min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {loading ? (
          <p className="text-sm text-slate-500">Henter ledige tider…</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-slate-500">
            Ingen ledige tider denne dag (eller dagen er passeret).
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.key}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {group.label}
              </p>
              {group.entries.length === 0 ? (
                <p className="text-xs text-slate-400">Ingen ledige tider</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-2">
                  {group.entries.map((entry) => {
                    const t = entry.time;
                    const busy = Boolean(entry.busy);
                    const active = selectedTime === t;
                    const disabled = busy && !allowSelectBusySlots;
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={disabled}
                        onClick={() => onSelectTime(t)}
                        title={busy && allowSelectBusySlots ? "Optaget — kan bookes som admin" : undefined}
                        className={[
                          "rounded-lg border px-2 py-2 text-center text-sm font-medium tabular-nums transition",
                          disabled
                            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                            : active
                              ? busy && allowSelectBusySlots
                                ? "border-amber-700 bg-amber-600 text-white shadow-md"
                                : "border-blue-600 bg-blue-600 text-white shadow-md"
                              : busy && allowSelectBusySlots
                                ? "border-amber-300 bg-amber-50/90 text-amber-950 hover:border-amber-500 hover:bg-amber-100/90"
                                : "border-blue-400 bg-white text-blue-700 hover:border-blue-500 hover:bg-blue-50/80",
                        ].join(" ")}
                      >
                        {formatSlotLabel(t)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
