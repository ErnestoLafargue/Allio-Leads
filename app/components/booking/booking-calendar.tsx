"use client";

import { useMemo } from "react";
import { isPastCopenhagenDayKey } from "@/lib/booking/availability";
import { startOfLocalDay, toCopenhagenDateKey, toDateKeyLocal } from "@/lib/booking/mock-availability";

const WEEK_LABELS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

function monthMatrix(year: number, monthIndex: number): (Date | null)[][] {
  const first = new Date(year, monthIndex, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, monthIndex, d, 12, 0, 0, 0));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

export type BookingCalendarProps = {
  /** Første dag i den viste måned (år + måned bruges) */
  monthAnchor: Date;
  onMonthChange: (nextMonthStart: Date) => void;
  selectedDate: Date | null;
  onSelectDate: (day: Date) => void;
};

export function BookingCalendar({
  monthAnchor,
  onMonthChange,
  selectedDate,
  onSelectDate,
}: BookingCalendarProps) {
  const y = monthAnchor.getFullYear();
  const m = monthAnchor.getMonth();
  const grid = useMemo(() => monthMatrix(y, m), [y, m]);
  const monthTitle = new Intl.DateTimeFormat("da-DK", { month: "long", year: "numeric" }).format(
    new Date(y, m, 1),
  );
  const selKey = selectedDate ? toDateKeyLocal(startOfLocalDay(selectedDate)) : null;

  function prevMonth() {
    onMonthChange(new Date(y, m - 1, 1));
  }

  function nextMonth() {
    onMonthChange(new Date(y, m + 1, 1));
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={prevMonth}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          aria-label="Forrige måned"
        >
          ‹
        </button>
        <span className="text-center text-base font-semibold capitalize text-slate-900">{monthTitle}</span>
        <button
          type="button"
          onClick={nextMonth}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-700 shadow-sm transition hover:bg-blue-100"
          aria-label="Næste måned"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {WEEK_LABELS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="mt-1 grid flex-1 auto-rows-fr gap-y-1">
        {grid.map((row, ri) => (
          <div key={ri} className="grid grid-cols-7 gap-1">
            {row.map((cell, ci) => {
              if (!cell) {
                return <div key={`empty-${ri}-${ci}`} className="aspect-square" />;
              }
              const dayStart = startOfLocalDay(cell);
              const key = toDateKeyLocal(dayStart);
              const past = isPastCopenhagenDayKey(toCopenhagenDateKey(dayStart));
              const selected = selKey === key;
              const disabled = past;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectDate(dayStart)}
                  className={[
                    "relative flex aspect-square max-h-11 w-full items-center justify-center rounded-full text-sm font-medium transition",
                    disabled
                      ? "cursor-not-allowed text-slate-300"
                      : "text-blue-700 hover:bg-blue-100/80",
                    selected && !disabled
                      ? "bg-blue-600 text-white shadow-md hover:bg-blue-600"
                      : !disabled && !selected
                        ? "bg-blue-50/90"
                        : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {cell.getDate()}
                  {selected && !disabled ? (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-white" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
