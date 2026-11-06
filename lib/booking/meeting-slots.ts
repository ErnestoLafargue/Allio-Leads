import { prisma } from "@/lib/prisma";
import { copenhagenDayBoundsUtcFromDayKey, copenhagenDayKey } from "@/lib/copenhagen-day";
import {
  canBookMeetingAt,
  hardBlocksForMeeting,
  isBeyondBookingHorizon,
  isPastCopenhagenDayKey,
  lastBookableDayKey,
  occupiedBlocksFromBlockedTimes,
  softBlocksForMeeting,
} from "@/lib/booking/availability";
import { getBookingSettings } from "@/lib/booking/booking-settings-db";
import type { BookingSettings } from "@/lib/booking/booking-settings";
import { maxMeetingFootprintMinutes } from "@/lib/booking/meeting-type-buffers";
import {
  multiSellerSlots,
  physicalMeetingsOnDay,
  pickSellerForMeeting,
  placeFloatingMeetings,
  type FloatingMeeting,
  type SellerCalendar,
  type SellerDayOptions,
  type SellerSlot,
} from "@/lib/booking/sellers";
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
import { listDrivingSellers } from "@/lib/meeting-assignee";
import { MEETING_OUTCOME_PENDING } from "@/lib/meeting-outcome";
import {
  MEETING_TYPE_ONLINE,
  MEETING_TYPE_PHYSICAL,
  type MeetingType,
  normalizeMeetingType,
} from "@/lib/meeting-type";

export type BookingQueryOpts = {
  excludeLeadId?: string;
  meetingType?: MeetingType | string;
  /** Fysiske møder pr. dag tiderne skal give plads til (4 standard, 3 ved «Overskrid»). */
  physicalMeetingsTarget?: number;
  /** Admin: ignorer ugedagsregler (salgsdage, onsdag) og 3-ugers-grænsen. */
  adminOverride?: boolean;
};

/**
 * Hver kørende sælgers kalender i [start, end) (+ polstring til møde+transport), i prioriteret
 * rækkefølge: egne møder, egne blokeringer og egen Native-occupancy. Møder uden (kørende) sælger
 * lægges ind hos den første sælger, der har plads — de optager altid én plads.
 */
export async function loadSellerCalendars(
  start: Date,
  end: Date,
  excludeLeadId?: string,
): Promise<SellerCalendar[]> {
  const sellers = await listDrivingSellers();
  if (sellers.length === 0) return [];
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
        meetingScheduledFor: true,
        meetingType: true,
        allioBookingId: true,
        assignedUserId: true,
      },
    }),
    prisma.blockedTime.findMany({
      where: {
        userId: { in: sellers.map((s) => s.id) },
        startDateTime: { lt: queryEnd },
        endDateTime: { gt: queryStart },
      },
      select: { userId: true, startDateTime: true, endDateTime: true },
    }),
    prisma.allioNativeOccupancy.findMany({
      where: {
        status: { not: "cancelled" },
        startDateTime: { lt: queryEnd },
        endDateTime: { gt: queryStart },
      },
      select: { allioBookingId: true, startDateTime: true, serviceIds: true, employeeId: true },
    }),
  ]);

  const calendars = new Map<string, SellerCalendar>(
    sellers.map((s) => [s.id, { sellerId: s.id, hardBlocks: [], softBlocks: [], physicalStartsMs: [] }]),
  );
  const floating: FloatingMeeting[] = [];
  const addTo = (sellerId: string | null | undefined, startMs: number, type: MeetingType) => {
    const cal = sellerId ? calendars.get(sellerId) : undefined;
    if (!cal) {
      floating.push({ startMs, meetingType: type });
      return;
    }
    cal.hardBlocks.push(...hardBlocksForMeeting(startMs, type));
    cal.softBlocks.push(...softBlocksForMeeting(startMs, type));
    if (type === MEETING_TYPE_PHYSICAL) cal.physicalStartsMs.push(startMs);
  };

  // Leads med Native-booking: occupancy er sandheden for tiden, men sælgeren står på leadet.
  const sellerByBookingId = new Map<string, string | null>();
  for (const l of leads) {
    if (l.allioBookingId) {
      sellerByBookingId.set(l.allioBookingId, l.assignedUserId);
      continue;
    }
    addTo(l.assignedUserId, l.meetingScheduledFor!.getTime(), normalizeMeetingType(l.meetingType));
  }

  const sellerByNativeEmployee = new Map(
    sellers.filter((s) => s.allioNativeEmployeeId).map((s) => [s.allioNativeEmployeeId!, s.id]),
  );
  for (const r of nativeRows) {
    const type = normalizeMeetingType(meetingTypeForServiceIds(parseServiceIdsJson(r.serviceIds)));
    const startMs = r.startDateTime.getTime();
    if (sellerByBookingId.has(r.allioBookingId)) {
      // Møde fra Allio-Leads: følg leadets sælger (null = «Ingen tildelt» → flydende).
      addTo(sellerByBookingId.get(r.allioBookingId), startMs, type);
    } else {
      // Egen aftale i Allio-Native (fx «Victor · Møde med …»): medarbejderen, ellers sælger nr. 1.
      addTo(
        (r.employeeId && sellerByNativeEmployee.get(r.employeeId)) || sellers[0]!.id,
        startMs,
        type,
      );
    }
  }

  // Manuel blokering er hard (møde-body må ikke ligge i blokken), men ikke soft:
  // transport før/efter fysisk møde må gerne løbe ind i/ud af en manuel blokering,
  // så et fysisk møde kan starte præcis når blokeringen slutter (fx blok 11–13 → start 13:00).
  for (const b of blockedRows) {
    calendars.get(b.userId)?.hardBlocks.push(...occupiedBlocksFromBlockedTimes([b]));
  }

  return placeFloatingMeetings([...calendars.values()], floating);
}

/**
 * Regler for fysiske møder pr. sælger på dagen: salgsdage og onsdag (samlet for alle sælgere
 * eller pr. sælger, afhængigt af indstillingen). `dayRule` er den samlede status til panelet.
 */
function physicalRulesForDay(
  dayKey: string,
  sellers: SellerCalendar[],
  settings: BookingSettings,
): { dayRule: PhysicalDayRule; forSeller: (sellerId: string) => SellerDayOptions } {
  const rules = {
    opensAtMeetingsPerDay: settings.wednesdayOpensAtMeetingsPerDay,
    earliestStartMin: settings.wednesdayEarliestStartMin,
  };
  if (isoWeekdayOfDayKey(dayKey) !== 3) {
    const rule = physicalDayRule(dayKey);
    const closed = rule.status === "SALES_DAY" || rule.status === "WEEKEND";
    return { dayRule: rule, forSeller: () => ({ closed }) };
  }

  const { thursday, friday } = thursdayFridayOfWeek(dayKey);
  const ruleFor = (s: SellerCalendar) =>
    physicalDayRule(
      dayKey,
      { thursday: physicalMeetingsOnDay(s, thursday), friday: physicalMeetingsOnDay(s, friday) },
      rules,
    );
  const toOptions = (rule: PhysicalDayRule): SellerDayOptions => ({
    closed: rule.status !== "WEDNESDAY_AFTERNOON",
    earliestStartMin: rule.earliestStartMin,
  });

  if (settings.wednesdayMode === "PER_SELLER") {
    const perSeller = new Map(sellers.map((s) => [s.sellerId, ruleFor(s)]));
    const open = [...perSeller.values()].find((r) => r.status === "WEDNESDAY_AFTERNOON");
    return {
      dayRule: open ?? perSeller.values().next().value ?? physicalDayRule(dayKey),
      forSeller: (id) => toOptions(perSeller.get(id) ?? physicalDayRule(dayKey)),
    };
  }

  // Samlet: onsdag åbner først, når ALLE kørende sælgere har nok torsdag og fredag.
  const min = (day: string) =>
    sellers.length ? Math.min(...sellers.map((s) => physicalMeetingsOnDay(s, day))) : 0;
  const rule = physicalDayRule(dayKey, { thursday: min(thursday), friday: min(friday) }, rules);
  return { dayRule: rule, forSeller: () => toOptions(rule) };
}

/** Kalender-rækkevidde for dagen — onsdag skal også se torsdag og fredag. */
function rangeForDay(dayKey: string): { start: Date; end: Date } {
  const { start, end } = copenhagenDayBoundsUtcFromDayKey(dayKey);
  if (isoWeekdayOfDayKey(dayKey) !== 3) return { start, end };
  return { start, end: copenhagenDayBoundsUtcFromDayKey(addDaysToDayKey(dayKey, 2)).end };
}

export type DayBookingSlots = {
  slots: SellerSlot[];
  /** Kun fysiske møder: dagens status (salgsdag, onsdag lukket/åben …). */
  dayRule: PhysicalDayRule | null;
  /** Sidste dag der kan bookes uden admin (YYYY-MM-DD). */
  lastBookableDayKey: string;
};

/** Ledige tider for dagen på tværs af kørende sælgere — med sælgeren hver tid tildeles. */
export async function getDayBookingSlots(
  dayKey: string,
  opts: BookingQueryOpts = {},
): Promise<DayBookingSlots> {
  const meetingType = normalizeMeetingType(opts.meetingType ?? MEETING_TYPE_ONLINE);
  const settings = await getBookingSettings();
  const lastDay = lastBookableDayKey(undefined, settings.horizonWeeks);
  const { start, end } = rangeForDay(dayKey);
  const sellers = await loadSellerCalendars(start, end, opts.excludeLeadId);

  const physical = meetingType === MEETING_TYPE_PHYSICAL;
  const rules = physical ? physicalRulesForDay(dayKey, sellers, settings) : null;
  const closedForSeller = !opts.adminOverride && dayKey > lastDay;
  const slots = closedForSeller
    ? []
    : multiSellerSlots(dayKey, meetingType, sellers, {
        physicalMeetingsTarget: opts.physicalMeetingsTarget,
        forSeller: rules && !opts.adminOverride ? rules.forSeller : undefined,
      });
  return { slots, dayRule: rules?.dayRule ?? null, lastBookableDayKey: lastDay };
}

/**
 * Hvem skal have et møde på `start`? Samme fordeling som tidsvælgeren (prioritet + sælgerens
 * 4-/3-møde-regel), ellers første sælger med plads. null = ingen sælger har plads.
 */
export async function pickSellerForBooking(
  start: Date,
  opts: BookingQueryOpts & {
    /** Sælgeren tidsvælgeren viste («Tildeles: …») — bruges hvis han stadig har plads. */
    preferredSellerId?: string | null;
  } = {},
): Promise<string | null> {
  const dayKey = copenhagenDayKey(start);
  const meetingType = normalizeMeetingType(opts.meetingType ?? MEETING_TYPE_ONLINE);
  const settings = await getBookingSettings();
  const { start: rangeStart, end: rangeEnd } = rangeForDay(dayKey);
  const sellers = await loadSellerCalendars(rangeStart, rangeEnd, opts.excludeLeadId);
  const rules =
    meetingType === MEETING_TYPE_PHYSICAL && !opts.adminOverride
      ? physicalRulesForDay(dayKey, sellers, settings)
      : null;
  const preferred = sellers.find((s) => s.sellerId === opts.preferredSellerId);
  if (
    preferred &&
    !rules?.forSeller(preferred.sellerId).closed &&
    canBookMeetingAt(start.getTime(), meetingType, preferred.hardBlocks, preferred.softBlocks)
  ) {
    return preferred.sellerId;
  }
  return pickSellerForMeeting(start.getTime(), dayKey, meetingType, sellers, {
    physicalMeetingsTarget: opts.physicalMeetingsTarget,
    forSeller: rules?.forSeller,
  });
}

/** Fejltekst når ingen sælger har plads på tidspunktet. */
export const NO_SELLER_AVAILABLE_MESSAGE =
  "Tidspunktet er ikke ledigt hos nogen sælger (møde, transport eller blokering). Vælg et andet tidspunkt.";

export type MonthBookingOverview = {
  /** Onsdage der er åbne for fysiske møder. */
  openWednesdays: string[];
  /** Hverdage der kan vælges, men ikke har én eneste ledig tid hos nogen sælger. */
  fullDays: string[];
  /** Sidste dag der kan bookes uden admin (YYYY-MM-DD). */
  lastBookableDayKey: string;
};

/**
 * Månedsoverblik til kalenderen (ét DB-opslag for hele perioden): åbne onsdage og fyldte dage
 * for mødetypen — med de samme regler som dagsvisningen.
 */
export async function getMonthBookingOverview(
  fromKey: string,
  toKey: string,
  opts: BookingQueryOpts = {},
): Promise<MonthBookingOverview> {
  const meetingType = normalizeMeetingType(opts.meetingType ?? MEETING_TYPE_ONLINE);
  const settings = await getBookingSettings();
  const lastDay = lastBookableDayKey(undefined, settings.horizonWeeks);
  // Onsdagsreglen kigger på torsdag/fredag — hent til og med fredagen efter sidste dag.
  const rangeStart = copenhagenDayBoundsUtcFromDayKey(fromKey).start;
  const rangeEnd = copenhagenDayBoundsUtcFromDayKey(addDaysToDayKey(toKey, 2)).end;
  const sellers = await loadSellerCalendars(rangeStart, rangeEnd, opts.excludeLeadId);

  const openWednesdays: string[] = [];
  const fullDays: string[] = [];
  for (let dayKey = fromKey; dayKey <= toKey; dayKey = addDaysToDayKey(dayKey, 1)) {
    if (isoWeekdayOfDayKey(dayKey) >= 6 || isPastCopenhagenDayKey(dayKey)) continue;

    const rules =
      meetingType === MEETING_TYPE_PHYSICAL ? physicalRulesForDay(dayKey, sellers, settings) : null;
    if (rules?.dayRule.status === "WEDNESDAY_AFTERNOON") openWednesdays.push(dayKey);
    if (!opts.adminOverride) {
      if (rules?.dayRule.status === "SALES_DAY" || rules?.dayRule.status === "WEDNESDAY_LOCKED") {
        continue;
      }
      if (isBeyondBookingHorizon(dayKey, undefined, settings.horizonWeeks)) continue;
    }

    const slots = multiSellerSlots(dayKey, meetingType, sellers, {
      physicalMeetingsTarget: opts.physicalMeetingsTarget,
      forSeller: rules && !opts.adminOverride ? rules.forSeller : undefined,
    });
    if (!slots.some((s) => s.available)) fullDays.push(dayKey);
  }
  return { openWednesdays, fullDays, lastBookableDayKey: lastDay };
}
