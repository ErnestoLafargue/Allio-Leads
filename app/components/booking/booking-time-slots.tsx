"use client";

export type TimeSlotsProps = {
  slots: string[];
  selectedTime: string | null;
  onSelectTime: (time: string) => void;
  /** Vist dato (overskrift) */
  dateLabel: string;
  loading?: boolean;
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
}: TimeSlotsProps) {
  return (
    <div className="flex min-h-[240px] min-w-0 flex-1 flex-col border-t border-slate-100 pt-4 lg:mt-0 lg:border-l lg:border-t-0 lg:pt-0 lg:pl-6">
      <h3 className="mb-3 shrink-0 text-sm font-semibold text-slate-900">{dateLabel}</h3>
      <div className="max-h-[min(340px,50vh)] min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {loading ? (
          <p className="text-sm text-slate-500">Henter ledige tider…</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-slate-500">
            Ingen ledige tider denne dag — alt kan være optaget af andre møder (75 min pr. booking) eller uden for
            09–17.
          </p>
        ) : (
          slots.map((t) => {
            const active = selectedTime === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onSelectTime(t)}
                className={[
                  "w-full rounded-lg border px-4 py-2.5 text-center text-sm font-medium transition",
                  active
                    ? "border-blue-600 bg-blue-600 text-white shadow-md"
                    : "border-blue-400 bg-white text-blue-700 hover:border-blue-500 hover:bg-blue-50/80",
                ].join(" ")}
              >
                {formatSlotLabel(t)}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
