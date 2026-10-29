"use client";

import Link from "next/link";
import { useMemo } from "react";
import { meetingOutcomeBadgeClass } from "@/lib/meeting-outcome";
import type { LeadOpenedFrom } from "@/lib/lead-navigation";
import { buildLeadDetailHref } from "@/lib/lead-navigation";
import {
  blockedSegmentsForDay,
  snapTimeFromColumnClick,
  transportSegmentsForDay,
  type BlockedTimeRow,
  type BlockedTimeSegment,
  type TransportSegment,
} from "@/lib/blocked-time-calendar";
import { meetingDurationMinutes } from "@/lib/booking/meeting-type-buffers";
import {
  filterMeetingsInWeek,
  formatWeekColumnHeaderDa,
  getIsoWeekNumberDa,
  layoutMeetingColumns,
  MEETING_CALENDAR_HEADER_HEIGHT_PX,
  MEETING_CALENDAR_HOUR_START,
  MEETING_CALENDAR_HOURS,
  MEETING_CALENDAR_ROW_HEIGHT_PX,
  meetingPlacement,
  meetingsForDayKey,
  nowLinePercent,
  startOfWeekMondayDayKey,
  todayDayKey,
  weekDayKeys,
} from "@/lib/meeting-week-calendar";
import { normalizeMeetingType } from "@/lib/meeting-type";

export type MeetingCalendarRow = {
  id: string;
  companyName: string;
  meetingContactName?: string | null;
  meetingScheduledFor: string | null;
  meetingType?: string | null;
  meetingOutcomeStatus?: string | null;
  bookedByUser: { id: string; name: string; username: string } | null;
  assignedUser?: { id: string; name: string; username: string; phone: string | null } | null;
};

export type CalendarEmptySlotClick = {
  dayKey: string;
  startTime: string;
};

type Props = {
  rows: MeetingCalendarRow[];
  blockedTimes?: BlockedTimeRow[];
  weekStartDayKey: string;
  loading: boolean;
  openedFrom: LeadOpenedFrom;
  canOpen: (m: MeetingCalendarRow) => boolean;
  onWeekStartChange: (dayKey: string) => void;
  onBlockTimesClick?: () => void;
  /** Admin: åbn kalender-indstillinger. */
  onSettingsClick?: () => void;
  onBlockedSegmentClick?: (segment: BlockedTimeSegment) => void;
  /** Klik på tomt felt i gitteret — åbn blokering med forudfyldt tid. */
  onEmptySlotClick?: (slot: CalendarEmptySlotClick) => void;
};

function meetingContactDisplayName(meeting: MeetingCalendarRow): string {
  const name = meeting.meetingContactName?.trim();
  if (name) return name;
  return "Kontakt ikke angivet";
}

function meetingCardSurfaceClass(raw?: string | null): string {
  const badge = meetingOutcomeBadgeClass(raw);
  if (badge.includes("emerald")) return "border-emerald-200/90 bg-emerald-50/95 text-emerald-950";
  if (badge.includes("red-600")) return "border-red-700/90 bg-red-600 text-white";
  if (badge.includes("red")) return "border-red-200/90 bg-red-50/95 text-red-900";
  if (badge.includes("blue")) return "border-blue-200/90 bg-blue-50/95 text-blue-950";
  return "border-amber-200/90 bg-amber-50/95 text-amber-950";
}

const UTC_YMD_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function addDaysToDayKey(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + delta * 86_400_000;
  return UTC_YMD_FMT.format(new Date(ms));
}

function MeetingCard({
  meeting,
  layout,
  placement,
  href,
  asLink,
}: {
  meeting: MeetingCalendarRow;
  layout: { leftPct: number; widthPct: number };
  placement: NonNullable<ReturnType<typeof meetingPlacement>>;
  href: string;
  asLink: boolean;
}) {
  const contactName = meetingContactDisplayName(meeting);
  const company = meeting.companyName.trim() || "—";
  const surface = meetingCardSurfaceClass(meeting.meetingOutcomeStatus);

  const hoverTitle = [
    placement.clamped ? `Faktisk tid: ${placement.actualTimeLabel}` : placement.actualTimeLabel,
    contactName,
    company,
  ].join("\n");

  const style: React.CSSProperties = {
    top: `${placement.topPct}%`,
    height: `${placement.heightPct}%`,
    left: `calc(${layout.leftPct}% + 3px)`,
    width: `calc(${layout.widthPct}% - 6px)`,
    minHeight: "3.75rem",
  };

  const inner = (
    <div
      className={[
        "flex h-full min-h-[3.75rem] flex-col gap-1 overflow-hidden rounded-lg border px-2.5 py-2 shadow-sm transition",
        surface,
        asLink ? "cursor-pointer hover:z-[4] hover:shadow-md hover:ring-1 hover:ring-stone-300/80" : "",
      ].join(" ")}
      title={hoverTitle}
    >
      <span className="shrink-0 text-[11px] font-semibold tabular-nums leading-none text-stone-700">
        {placement.actualTimeLabel}
      </span>
      <span className="line-clamp-2 text-[12px] font-bold leading-tight tracking-tight text-stone-950">
        {contactName}
      </span>
      <span className="line-clamp-2 text-[10px] font-medium leading-snug text-stone-600">
        {company}
      </span>
    </div>
  );

  if (asLink) {
    return (
      <Link href={href} className="absolute z-[2] block" style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <div className="absolute z-[2]" style={style}>
      {inner}
    </div>
  );
}

function BlockedSegmentCard({
  segment,
  row,
  onClick,
}: {
  segment: BlockedTimeSegment;
  row: BlockedTimeRow;
  onClick?: () => void;
}) {
  const label = segment.userName
    ? `${segment.userName.split(" ")[0]} · ${segment.title}`
    : segment.title;
  const style: React.CSSProperties = {
    top: `${segment.topPct}%`,
    height: `${segment.heightPct}%`,
    left: "3px",
    right: "3px",
    minHeight: "1.5rem",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute z-[1] flex cursor-pointer flex-col justify-center overflow-hidden rounded-lg border border-stone-300/80 bg-stone-200/70 px-2 py-1 text-left text-stone-600 shadow-sm transition hover:z-[2] hover:bg-stone-200/90 hover:ring-1 hover:ring-stone-400/60"
      style={style}
      title={[segment.title, row.user?.name].filter(Boolean).join(" — ")}
    >
      <span className="line-clamp-2 text-[10px] font-semibold leading-tight">{label}</span>
    </button>
  );
}

function TransportSegmentCard({ segment }: { segment: TransportSegment }) {
  const style: React.CSSProperties = {
    top: `${segment.topPct}%`,
    height: `${segment.heightPct}%`,
    left: "3px",
    right: "3px",
    minHeight: "1.25rem",
  };
  return (
    <div
      className="pointer-events-none absolute z-[1] flex flex-col justify-center overflow-hidden rounded-lg border border-dashed border-violet-300/80 bg-violet-100/55 px-2 py-0.5 text-violet-800"
      style={style}
      title="Transportblokering (fysisk møde)"
    >
      <span className="line-clamp-1 text-[10px] font-semibold leading-tight">{segment.title}</span>
    </div>
  );
}

export function MeetingsWeekCalendar({
  rows,
  blockedTimes = [],
  weekStartDayKey,
  loading,
  openedFrom,
  canOpen,
  onWeekStartChange,
  onBlockTimesClick,
  onSettingsClick,
  onBlockedSegmentClick,
  onEmptySlotClick,
}: Props) {
  const weekKeys = useMemo(() => weekDayKeys(weekStartDayKey), [weekStartDayKey]);
  const weekMeetings = useMemo(
    () => filterMeetingsInWeek(rows, weekStartDayKey),
    [rows, weekStartDayKey],
  );
  const weekNumber = useMemo(() => getIsoWeekNumberDa(weekStartDayKey), [weekStartDayKey]);
  const today = todayDayKey();
  const nowPct = nowLinePercent(new Date());
  const nowDayIndex = weekKeys.findIndex((k) => k === today);
  const showNowLine = nowPct != null && nowDayIndex >= 0;

  const gridBodyHeight = MEETING_CALENDAR_HOURS * MEETING_CALENDAR_ROW_HEIGHT_PX;
  const hours = Array.from({ length: MEETING_CALENDAR_HOURS }, (_, i) => MEETING_CALENDAR_HOUR_START + i);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onWeekStartChange(addDaysToDayKey(weekStartDayKey, -7))}
          className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50"
        >
          ‹ Forrige uge
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-stone-900">Uge {weekNumber}</p>
          <p className="text-xs text-stone-500">
            {formatWeekColumnHeaderDa(weekKeys[0]).dayMonth} –{" "}
            {formatWeekColumnHeaderDa(weekKeys[6]).dayMonth}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onBlockTimesClick ? (
            <button
              type="button"
              onClick={onBlockTimesClick}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50"
            >
              Bloker tider
            </button>
          ) : null}
          {onSettingsClick ? (
            <button
              type="button"
              onClick={onSettingsClick}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50"
            >
              Indstillinger
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onWeekStartChange(addDaysToDayKey(weekStartDayKey, 7))}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50"
          >
            Næste uge ›
          </button>
          <button
            type="button"
            onClick={() => onWeekStartChange(startOfWeekMondayDayKey())}
            className="rounded-lg border border-stone-300 bg-stone-800 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-stone-900"
          >
            I dag
          </button>
        </div>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-stone-500">Henter møder…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-sm">
          <div className="min-w-[960px]">
            <div
              className="grid border-b border-stone-200"
              style={{ gridTemplateColumns: "4.5rem repeat(7, minmax(0, 1fr))" }}
            >
              <div
                className="sticky left-0 z-20 border-r border-stone-200 bg-stone-50/95"
                style={{ height: MEETING_CALENDAR_HEADER_HEIGHT_PX }}
              />
              {weekKeys.map((dayKey) => {
                const { weekday, dayMonth } = formatWeekColumnHeaderDa(dayKey);
                const isToday = dayKey === today;
                return (
                  <div
                    key={dayKey}
                    className={[
                      "flex flex-col items-center justify-center gap-0.5 border-r border-stone-200 px-2 py-2 text-center",
                      isToday ? "bg-sky-50/90" : "bg-stone-50/90",
                    ].join(" ")}
                    style={{ minHeight: MEETING_CALENDAR_HEADER_HEIGHT_PX }}
                  >
                    <span className="text-[10px] font-medium uppercase tracking-wide text-stone-500">
                      {weekday}
                    </span>
                    <span className="text-sm font-semibold text-stone-900">{dayMonth}</span>
                  </div>
                );
              })}
            </div>

            <div className="flex">
              <div
                className="sticky left-0 z-10 shrink-0 border-r border-stone-200 bg-white"
                style={{ width: "4.5rem", height: gridBodyHeight }}
              >
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="relative border-b border-stone-100 pr-2 text-right text-xs tabular-nums text-stone-500"
                    style={{ height: MEETING_CALENDAR_ROW_HEIGHT_PX }}
                  >
                    <span className="absolute -top-2 right-2">{String(hour).padStart(2, "0")}:00</span>
                  </div>
                ))}
              </div>

              <div className="relative flex flex-1">
                {weekKeys.map((dayKey, dayIndex) => {
                  const dayMeetings = meetingsForDayKey(weekMeetings, dayKey);
                  const layoutMap = layoutMeetingColumns(
                    dayMeetings.map((m) => m.id),
                    (id) => dayMeetings.find((m) => m.id === id)!.meetingScheduledFor!,
                    (id) =>
                      meetingDurationMinutes(
                        normalizeMeetingType(
                          dayMeetings.find((m) => m.id === id)?.meetingType,
                        ),
                      ),
                  );
                  const isToday = dayKey === today;
                  const transports = transportSegmentsForDay(dayKey, dayMeetings);

                  return (
                    <div
                      key={dayKey}
                      className={[
                        "relative min-w-0 flex-1 border-r border-stone-200",
                        isToday ? "bg-sky-50/25" : "bg-white",
                        onEmptySlotClick ? "cursor-crosshair" : "",
                      ].join(" ")}
                      style={{ height: gridBodyHeight }}
                      onClick={
                        onEmptySlotClick
                          ? (e) => {
                              const target = e.target as HTMLElement;
                              if (target.closest("a, button")) return;
                              const rect = e.currentTarget.getBoundingClientRect();
                              const offsetY = e.clientY - rect.top;
                              const startTime = snapTimeFromColumnClick(offsetY, rect.height);
                              onEmptySlotClick({ dayKey, startTime });
                            }
                          : undefined
                      }
                    >
                      {hours.map((hour, hi) => (
                        <div
                          key={hour}
                          className="pointer-events-none absolute left-0 right-0 border-b border-stone-100"
                          style={{ top: hi * MEETING_CALENDAR_ROW_HEIGHT_PX, height: MEETING_CALENDAR_ROW_HEIGHT_PX }}
                        />
                      ))}

                      {showNowLine && dayIndex === nowDayIndex && nowPct != null ? (
                        <div
                          className="pointer-events-none absolute left-0 right-0 z-[3] h-0.5 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.75)]"
                          style={{ top: `${nowPct}%` }}
                        />
                      ) : null}

                      {transports.map((seg) => (
                        <TransportSegmentCard key={seg.id} segment={seg} />
                      ))}

                      {blockedSegmentsForDay(dayKey, blockedTimes).map((seg) => {
                        const row = blockedTimes.find((b) => b.id === seg.id);
                        if (!row) return null;
                        return (
                          <BlockedSegmentCard
                            key={`${seg.id}-${dayKey}`}
                            segment={seg}
                            row={row}
                            onClick={onBlockedSegmentClick ? () => onBlockedSegmentClick(seg) : undefined}
                          />
                        );
                      })}

                      {dayMeetings.map((m) => {
                        if (!m.meetingScheduledFor) return null;
                        const duration = meetingDurationMinutes(normalizeMeetingType(m.meetingType));
                        const placement = meetingPlacement(m.meetingScheduledFor, duration);
                        if (!placement) return null;
                        const layout = layoutMap.get(m.id) ?? {
                          leftPct: 0,
                          widthPct: 100,
                          columnIndex: 0,
                          columnCount: 1,
                        };
                        return (
                          <MeetingCard
                            key={m.id}
                            meeting={m}
                            layout={layout}
                            placement={placement}
                            href={buildLeadDetailHref(m.id, openedFrom)}
                            asLink={canOpen(m)}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && weekMeetings.length === 0 && (
        <p className="text-center text-sm text-stone-500">Ingen møder i denne uge.</p>
      )}

      <p className="text-xs text-stone-500">
        Ugevisning mandag–søndag, {MEETING_CALENDAR_HOUR_START}:00–
        {MEETING_CALENDAR_HOUR_START + MEETING_CALENDAR_HOURS - 1}:00 (Europe/Copenhagen). Klik et tomt
        felt for at blokere tid. Grå felter er manuelle blokeringer — klik for at redigere. Lilla
        stiplede felter er transport (fysiske møder). Klik et møde for at åbne leadet.
      </p>
    </div>
  );
}
