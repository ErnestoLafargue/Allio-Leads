import { prisma } from "@/lib/prisma";
import { copenhagenDayBoundsUtcFromDayKey, copenhagenDayKey } from "@/lib/copenhagen-day";
import {
  findBlockedTimeConflict,
  getCopenhagenBookingSlotsForMeetingType,
  isBeyondBookingHorizon,
  isPastCopenhagenDayKey,
  occupiedBlocksFromBlockedTimes,
  occupiedBlocksFromNativeOccupancy,
  occupiedBlocksFromScheduledMeetings,
  softOccupiedBlocksFromNativeOccupancy,
  softOccupiedBlocksFromScheduledMeetings,
  type CopenhagenBookingSlotWithAvailability,
  type TimeBlockMs,
} from "@/lib/booking/availability";
import { maxMeetingFootprintMinutes } from "@/lib/booking/meeting-type-buffers";
import {
  addDaysToDayKey,
  isoWeekdayOfDayKey,
  physicalDayRule,
  thursdayFridayOfWeek,
  type PhysicalDayRule,
} from "@/lib/booking/weekday-rules";
import {
  meetingTypeForServiceIds,
  parseServiceIdsJson,
} from "@/lib/allio-native/service-buffers";
import { MEETING_OUTCOME_PENDING } from "@/lib/meeting-outcome";
import {
  MEETING_TYPE_ONLINE,
  MEETING_TYPE_PHYSICAL,
  type MeetingType,
  normalizeMeetingType,
} from "@/lib/meeting-type";

export type GetAvailableMeetingSlotsOpts = {
  excludeLeadId?: string;
  /** @deprecated Ignoreres. */
  blockMinutes?: number;
  meetingType?: MeetingType | string;
  /** Fysiske møder pr. dag tiderne skal give plads til (4 standard, 3 ved «Overskrid»). */
  physicalMeetingsTarget?: number;
  /** Tidligste start (minutter efter midnat), fx onsdag fra 14:00. */
  earliestStartMin?: number;
};

type BookingOccupancy = {
  hardBlocks: TimeBlockMs[];
  softBlocks: TimeBlockMs[];
  /** Starttidspunkter (UTC-ms) for ventende fysiske møder. */
  physicalStartsMs: number[];
};

/**
 * Optaget tid i [start, end) (+ polstring til møde+transport): ventende møder, brugerens
 * manuelle blokeringer og Allio-Native occupancy — som hard/soft-blokke.
 */
async function loadBookingOccupancy(
  userId: string,
  start: Date,
  end: Date,
  excludeLeadId?: string,
): Promise<BookingOccupancy> {
  const padMs = maxMeetingFootprintMinutes() * 60 * 1000;
  const queryStart = new Date(start.getTime() - padMs);
  const queryEnd = new Date(end.getTime() + padMs);

  const [leads, blockedRows, nativeRows] = await Promise.all([
    prisma.lead.findMany({
      where: {
        status: "MEETING_BOOKED",
        meetingScheduledFor: { not: null, gte: queryStart, lt: queryEnd },
        meetingOutcomeStatus: MEETING_OUTCOME_PENDING,
        ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
      },
      select: {
        id: true,
        meetingScheduledFor: true,
        meetingOutcomeStatus: true,
        meetingType: true,
        allioBookingId: true,
      },
    }),
    prisma.blockedTime.findMany({
      where: {
        userId,
        startDateTime: { lt: end },
        endDateTime: { gt: start },
      },
      select: { startDateTime: true, endDateTime: true },
    }),
    prisma.allioNativeOccupancy.findMany({
      where: {
        status: { not: "cancelled" },
        startDateTime: { lt: queryEnd },
        endDateTime: { gt: queryStart },
      },
      select: { startDateTime: true, endDateTime: true, serviceIds: true },
    }),
  ]);

  // Leads med Native-booking: occupancy er sandheden — undgå dobbeltblok.
  const localOnlyLeads = leads.filter((l) => !l.allioBookingId);
  const resolveType = (raw: string | null | undefined) =>
    meetingTypeForServiceIds(parseServiceIdsJson(raw));

  // Manuel blokering er hard (møde-body må ikke ligge i blokken), men ikke soft:
  // transport før/efter fysisk møde må gerne løbe ind i/ud af en manuel blokering,
  // så et fysisk møde kan starte præcis når blokeringen slutter (fx blok 11–13 → start 13:00).
  const hardBlocks = [
    ...occupiedBlocksFromScheduledMeetings(localOnlyLeads),
    ...occupiedBlocksFromBlockedTimes(blockedRows),
    ...occupiedBlocksFromNativeOccupancy(nativeRows, resolveType),
  ];
  const softBlocks = [
    ...softOccupiedBlocksFromScheduledMeetings(localOnlyLeads),
    ...softOccupiedBlocksFromNativeOccupancy(nativeRows, resolveType),
  ];
  const physicalStartsMs = [
    ...localOnlyLeads
      .filter((l) => normalizeMeetingType(l.meetingType) === MEETING_TYPE_PHYSICAL)
      .map((l) => l.meetingScheduledFor!.getTime()),
    ...nativeRows
      .filter((r) => resolveType(r.serviceIds) === MEETING_TYPE_PHYSICAL)
      .map((r) => r.startDateTime.getTime()),
  ];
  return { hardBlocks, softBlocks, physicalStartsMs };
}

/** Fysiske møder der starter på dagen [start, end). */
function countStartsWithin(startsMs: number[], start: Date, end: Date): number {
  return startsMs.filter((ms) => ms >= start.getTime() && ms < end.getTime()).length;
}

/**
 * Ledige booking-slots for en bruger: møde+transport + manuelle blokeringer + Native occupancy.
 */
export async function getAvailableMeetingSlots(
  userId: string,
  dayKey: string,
  opts: GetAvailableMeetingSlotsOpts = {},
): Promise<CopenhagenBookingSlotWithAvailability[]> {
  const meetingType = normalizeMeetingType(opts.meetingType ?? MEETING_TYPE_ONLINE);
  const { start, end } = copenhagenDayBoundsUtcFromDayKey(dayKey);
  const { hardBlocks, softBlocks, physicalStartsMs } = await loadBookingOccupancy(
    userId,
    start,
    end,
    opts.excludeLeadId,
  );
  return getCopenhagenBookingSlotsForMeetingType(dayKey, meetingType, hardBlocks, softBlocks, {
    // Fysiske møder der starter på dagen — tæller med i målet for fysiske møder pr. dag.
    physicalMeetingsBookedOnDay: countStartsWithin(physicalStartsMs, start, end),
    physicalMeetingsTarget: opts.physicalMeetingsTarget,
    earliestStartMin: opts.earliestStartMin,
  });
}

export type MonthBookingOverview = {
  /** Onsdage der er åbne for fysiske møder (tor+fre samme uge har hver mindst 3). */
  openWednesdays: string[];
  /** Hverdage der kan vælges, men ikke har én eneste ledig tid. */
  fullDays: string[];
};

/**
 * Månedsoverblik til kalenderen (ét DB-opslag for hele perioden): åbne onsdage og fyldte dage
 * for mødetypen — med de samme regler som dagsvisningen (ugedage, 3-ugers-grænse, onsdag fra 14).
 */
export async function getMonthBookingOverview(
  userId: string,
  fromKey: string,
  toKey: string,
  opts: GetAvailableMeetingSlotsOpts & { adminOverride?: boolean } = {},
): Promise<MonthBookingOverview> {
  const meetingType = normalizeMeetingType(opts.meetingType ?? MEETING_TYPE_ONLINE);
  // Onsdagsreglen kigger på torsdag/fredag — hent til og med fredagen efter sidste dag.
  const rangeStart = copenhagenDayBoundsUtcFromDayKey(fromKey).start;
  const rangeEnd = copenhagenDayBoundsUtcFromDayKey(addDaysToDayKey(toKey, 2)).end;
  const { hardBlocks, softBlocks, physicalStartsMs } = await loadBookingOccupancy(
    userId,
    rangeStart,
    rangeEnd,
    opts.excludeLeadId,
  );
  const physicalOnDay = (dayKey: string) => {
    const { start, end } = copenhagenDayBoundsUtcFromDayKey(dayKey);
    return countStartsWithin(physicalStartsMs, start, end);
  };

  const openWednesdays: string[] = [];
  const fullDays: string[] = [];
  const dayMs = 24 * 60 * 60 * 1000;
  for (let dayKey = fromKey; dayKey <= toKey; dayKey = addDaysToDayKey(dayKey, 1)) {
    if (isoWeekdayOfDayKey(dayKey) >= 6 || isPastCopenhagenDayKey(dayKey)) continue;

    let earliestStartMin: number | undefined;
    if (meetingType === MEETING_TYPE_PHYSICAL) {
      const { thursday, friday } = thursdayFridayOfWeek(dayKey);
      const rule = physicalDayRule(
        dayKey,
        isoWeekdayOfDayKey(dayKey) === 3
          ? { thursday: physicalOnDay(thursday), friday: physicalOnDay(friday) }
          : undefined,
      );
      if (rule.status === "WEDNESDAY_AFTERNOON") openWednesdays.push(dayKey);
      if (!opts.adminOverride) {
        if (rule.status === "SALES_DAY" || rule.status === "WEDNESDAY_LOCKED") continue;
        earliestStartMin = rule.earliestStartMin;
      }
    }
    if (!opts.adminOverride && isBeyondBookingHorizon(dayKey)) continue;

    // Kun blokke tæt på dagen — hurtigere og samme resultat.
    const { start, end } = copenhagenDayBoundsUtcFromDayKey(dayKey);
    const near = (b: TimeBlockMs) => b.endMs > start.getTime() - dayMs && b.startMs < end.getTime() + dayMs;
    const slots = getCopenhagenBookingSlotsForMeetingType(
      dayKey,
      meetingType,
      hardBlocks.filter(near),
      softBlocks.filter(near),
      {
        physicalMeetingsBookedOnDay: physicalOnDay(dayKey),
        physicalMeetingsTarget: opts.physicalMeetingsTarget,
        earliestStartMin,
      },
    );
    if (!slots.some((s) => s.available)) fullDays.push(dayKey);
  }
  return { openWednesdays, fullDays };
}

/** Fysiske møder (ventende) pr. dag (YYYY-MM-DD, København) i [start, end) — leads uden Native + Native occupancy. */
async function countPhysicalMeetingsByDay(
  start: Date,
  end: Date,
  excludeLeadId?: string,
): Promise<Map<string, number>> {
  const [leads, nativeRows] = await Promise.all([
    prisma.lead.findMany({
      where: {
        status: "MEETING_BOOKED",
        meetingScheduledFor: { gte: start, lt: end },
        meetingOutcomeStatus: MEETING_OUTCOME_PENDING,
        allioBookingId: null,
        ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
      },
      select: { meetingScheduledFor: true, meetingType: true },
    }),
    prisma.allioNativeOccupancy.findMany({
      where: { status: { not: "cancelled" }, startDateTime: { gte: start, lt: end } },
      select: { startDateTime: true, serviceIds: true },
    }),
  ]);
  const counts = new Map<string, number>();
  const add = (d: Date) => {
    const key = copenhagenDayKey(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (const l of leads) {
    if (l.meetingScheduledFor && normalizeMeetingType(l.meetingType) === MEETING_TYPE_PHYSICAL) {
      add(l.meetingScheduledFor);
    }
  }
  for (const r of nativeRows) {
    if (meetingTypeForServiceIds(parseServiceIdsJson(r.serviceIds)) === MEETING_TYPE_PHYSICAL) {
      add(r.startDateTime);
    }
  }
  return counts;
}

/** Fysiske møder (ventende) der starter på dagen. */
export async function countPhysicalMeetingsOnDay(
  dayKey: string,
  excludeLeadId?: string,
): Promise<number> {
  const { start, end } = copenhagenDayBoundsUtcFromDayKey(dayKey);
  return (await countPhysicalMeetingsByDay(start, end, excludeLeadId)).get(dayKey) ?? 0;
}

/** Ugedagsregel for fysiske møder på dagen — onsdag tæller torsdag/fredag samme uge. */
export async function getPhysicalDayRule(
  dayKey: string,
  excludeLeadId?: string,
): Promise<PhysicalDayRule> {
  if (isoWeekdayOfDayKey(dayKey) !== 3) return physicalDayRule(dayKey);
  const { thursday, friday } = thursdayFridayOfWeek(dayKey);
  const [thursdayCount, fridayCount] = await Promise.all([
    countPhysicalMeetingsOnDay(thursday, excludeLeadId),
    countPhysicalMeetingsOnDay(friday, excludeLeadId),
  ]);
  return physicalDayRule(dayKey, { thursday: thursdayCount, friday: fridayCount });
}

/** Hent manuelle blokeringer der overlapper et foreslået møde (body + transport). */
export async function findBlockedTimeConflictInDb(
  userId: string,
  proposedStart: Date,
  meetingType: MeetingType | string = MEETING_TYPE_ONLINE,
): Promise<{ id: string; title: string } | null> {
  const startMs = proposedStart.getTime();
  if (Number.isNaN(startMs)) return null;
  const pad = maxMeetingFootprintMinutes() * 60 * 1000;
  const rows = await prisma.blockedTime.findMany({
    where: {
      userId,
      startDateTime: { lte: new Date(startMs + pad) },
      endDateTime: { gte: new Date(startMs - pad) },
    },
    select: { id: true, title: true, startDateTime: true, endDateTime: true },
  });
  return findBlockedTimeConflict(proposedStart, rows, meetingType);
}
