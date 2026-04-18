"use client";

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
  return (
    <div className="flex min-h-[240px] min-w-0 flex-1 flex-col border-t border-slate-100 pt-4 lg:mt-0 lg:border-l lg:border-t-0 lg:pt-0 lg:pl-6">
      <h3 className="mb-3 shrink-0 text-sm font-semibold text-slate-900">{dateLabel}</h3>
      <div className="max-h-[min(340px,50vh)] min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {loading ? (
          <p className="text-sm text-slate-500">Henter ledige tider…</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-slate-500">
            Ingen tider denne dag i kalendervinduet (eller dagen er passeret).
          </p>
        ) : (
          slots.map((entry) => {
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
                className={[
                  "w-full rounded-lg border px-4 py-2.5 text-center text-sm font-medium transition",
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
                <span className="inline-flex w-full items-center justify-center gap-2">
                  {formatSlotLabel(t)}
                  {busy && allowSelectBusySlots ? (
                    <span className="rounded bg-amber-200/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950">
                      Optaget
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
