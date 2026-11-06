"use client";

import { useMemo } from "react";
import { isPastCopenhagenDayKey } from "@/lib/booking/availability";
import { startOfLocalDay, toCopenhagenDateKey, toDateKeyLocal } from "@/lib/booking/mock-availability";

/** Kun hverdage — der bookes ikke møder lørdag/søndag. */
const WEEK_LABELS = ["Man", "Tir", "Ons", "Tor", "Fre"];
const WEEKDAYS = WEEK_LABELS.length;

/** ISO-8601 ugenummer (Man–Søn; uge 1 indeholder årets første torsdag) — dansk standard. */
function isoWeekNumber(d: Date): number {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const week1 = new Date(t.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((t.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
    )
  );
}

function weekNumberForRow(row: (Date | null)[]): number | null {
  const anchor = row.find((c) => c != null) ?? null;
  return anchor ? isoWeekNumber(anchor) : null;
}

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
    const weekdays = cells.slice(i, i + WEEKDAYS);
    // Uge hvor måneden kun rammer weekenden (fx 1. er en lørdag) — ingen hverdage at vise.
    if (weekdays.some((c) => c != null)) rows.push(weekdays);
  }
  return rows;
}

export type BookingCalendarProps = {
  /** Første dag i den viste måned (år + måned bruges) */
  monthAnchor: Date;
  onMonthChange: (nextMonthStart: Date) => void;
  selectedDate: Date | null;
  onSelectDate: (day: Date) => void;
  /** Sidste dag der kan vælges (YYYY-MM-DD, København) — null/undefined = ingen grænse. */
  lastBookableDayKey?: string | null;
  /** ISO-ugedage (man=1 …) der ikke kan vælges, fx salgsdage for fysiske møder. */
  closedIsoWeekdays?: readonly number[];
  /** Hvis sat: kun onsdage i sættet kan vælges (fysiske møder — tor+fre skal være næsten fyldt). */
  openWednesdayKeys?: ReadonlySet<string>;
  /** Dage uden ledige tider — kan stadig vælges, men vises med lys rød cirkel. */
  fullDayKeys?: ReadonlySet<string>;
};

export function BookingCalendar({
  monthAnchor,
  onMonthChange,
  selectedDate,
  onSelectDate,
  lastBookableDayKey,
  closedIsoWeekdays,
  openWednesdayKeys,
  fullDayKeys,
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
    <div className="flex min-w-0 flex-1 flex-col lg:w-1/3 lg:flex-none">
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

      <div className="grid grid-cols-[repeat(5,minmax(0,1fr))_1.75rem] gap-y-1 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {WEEK_LABELS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
        <div className="py-1 text-[10px] font-semibold normal-case tracking-normal text-slate-400" title="Ugenummer">
          Uge
        </div>
      </div>

      <div className="mt-1 grid flex-1 auto-rows-fr gap-y-1">
        {grid.map((row, ri) => {
          const weekNo = weekNumberForRow(row);
          return (
            <div
              key={ri}
              className="grid grid-cols-[repeat(5,minmax(0,1fr))_1.75rem] items-center gap-1"
            >
              {row.map((cell, ci) => {
                if (!cell) {
                  return <div key={`empty-${ri}-${ci}`} className="mx-auto aspect-square w-full max-w-14" />;
                }
                const dayStart = startOfLocalDay(cell);
                const key = toDateKeyLocal(dayStart);
                const cphKey = toCopenhagenDateKey(dayStart);
                const past = isPastCopenhagenDayKey(cphKey);
                const beyondHorizon = lastBookableDayKey != null && cphKey > lastBookableDayKey;
                const closedWeekday = closedIsoWeekdays?.includes(ci + 1) ?? false;
                const lockedWednesday =
                  ci + 1 === 3 && openWednesdayKeys != null && !openWednesdayKeys.has(cphKey);
                const selected = selKey === key;
                const disabled = past || beyondHorizon || closedWeekday || lockedWednesday;
                const full = !disabled && (fullDayKeys?.has(cphKey) ?? false);

                return (
                  <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelectDate(dayStart)}
                    title={
                      closedWeekday
                        ? "Salgsdag — ingen fysiske møder"
                        : lockedWednesday
                          ? "Onsdag åbner, når torsdag og fredag har mindst 3 fysiske møder hver"
                          : full
                            ? "Ingen ledige tider"
                        : beyondHorizon
                          ? "Kan kun bookes af admin (længere end 3 uger frem)"
                          : undefined
                    }
                    className={[
                      "relative mx-auto flex aspect-square w-full max-w-14 items-center justify-center rounded-full text-sm font-medium transition",
                      disabled
                        ? "cursor-not-allowed text-slate-300"
                        : full
                          ? "text-red-700 hover:bg-red-200/60"
                          : "text-blue-700 hover:bg-blue-100/80",
                      selected && !disabled
                        ? full
                          ? "bg-red-400/35 text-red-800 shadow-md ring-2 ring-red-300/70 hover:bg-red-400/35"
                          : "bg-blue-600 text-white shadow-md hover:bg-blue-600"
                        : !disabled && !selected
                          ? full
                            ? "bg-red-100/70"
                            : "bg-blue-50/90"
                          : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {cell.getDate()}
                    {selected && !disabled ? (
                      <span
                        className={[
                          "absolute bottom-1 h-1 w-1 rounded-full",
                          full ? "bg-red-700" : "bg-white",
                        ].join(" ")}
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })}
              <div
                className="flex h-full max-h-14 items-center justify-center text-[11px] font-semibold tabular-nums text-slate-500"
                aria-label={weekNo != null ? `Uge ${weekNo}` : undefined}
              >
                {weekNo ?? ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
