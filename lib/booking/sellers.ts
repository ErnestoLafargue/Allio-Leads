/**
 * Flere kørende sælgere: hver sælger har sin egen kalender (møder, transport, blokeringer,
 * Native-occupancy). Ledige tider er foreningen af sælgernes ledige tider, og hver tid
 * tildeles den højest prioriterede sælger, der kan tage den (Victor fyldes først, så Ernesto …).
 * Ren fil (ingen DB) — data hentes i lib/booking/meeting-slots.ts.
 */
import { copenhagenDayBoundsUtcFromDayKey } from "@/lib/copenhagen-day";
import {
  canBookMeetingAt,
  getCopenhagenBookingSlotsForMeetingType,
  hardBlocksForMeeting,
  softBlocksForMeeting,
  type CopenhagenBookingSlotWithAvailability,
  type TimeBlockMs,
} from "@/lib/booking/availability";
import { MEETING_TYPE_PHYSICAL, normalizeMeetingType, type MeetingType } from "@/lib/meeting-type";

/** Én sælgers optagne tid. Listen af sælgere er altid sorteret efter prioritet (1 først). */
export type SellerCalendar = {
  sellerId: string;
  hardBlocks: TimeBlockMs[];
  softBlocks: TimeBlockMs[];
  /** Starttidspunkter (UTC-ms) for sælgerens ventende fysiske møder. */
  physicalStartsMs: number[];
};

/** Møde uden sælger («Ingen tildelt») — optager stadig én plads. */
export type FloatingMeeting = { startMs: number; meetingType: MeetingType | string };

export type SellerSlot = CopenhagenBookingSlotWithAvailability & {
  /** Sælgeren tiden tildeles (null hvis ingen kan tage den). */
  sellerId: string | null;
};

/** Regler for én sælger på én dag (fx onsdag pr. sælger). */
export type SellerDayOptions = { closed?: boolean; earliestStartMin?: number };

export type MultiSellerOptions = {
  physicalMeetingsTarget?: number;
  /** Lukket/tidligste start pr. sælger — samme for alle hvis den ikke afhænger af sælgeren. */
  forSeller?: (sellerId: string) => SellerDayOptions;
};

function addMeeting(cal: SellerCalendar, startMs: number, meetingType: MeetingType | string): void {
  cal.hardBlocks.push(...hardBlocksForMeeting(startMs, meetingType));
  cal.softBlocks.push(...softBlocksForMeeting(startMs, meetingType));
  if (normalizeMeetingType(meetingType) === MEETING_TYPE_PHYSICAL) cal.physicalStartsMs.push(startMs);
}

/**
 * Læg møder uden sælger ind hos den første sælger (efter prioritet), der kan tage dem —
 * ellers hos sælger nr. 1. Så bliver der aldrig overbooket, mens møder flyttes rundt.
 */
export function placeFloatingMeetings(
  sellers: SellerCalendar[],
  floating: FloatingMeeting[],
): SellerCalendar[] {
  const out = sellers.map((s) => ({
    ...s,
    hardBlocks: [...s.hardBlocks],
    softBlocks: [...s.softBlocks],
    physicalStartsMs: [...s.physicalStartsMs],
  }));
  if (out.length === 0) return out;
  for (const m of [...floating].sort((a, b) => a.startMs - b.startMs)) {
    const target =
      out.find((s) => canBookMeetingAt(m.startMs, m.meetingType, s.hardBlocks, s.softBlocks)) ??
      out[0]!;
    addMeeting(target, m.startMs, m.meetingType);
  }
  return out;
}

/** Sælgerens fysiske møder der starter på dagen. */
export function physicalMeetingsOnDay(seller: SellerCalendar, dayKey: string): number {
  const { start, end } = copenhagenDayBoundsUtcFromDayKey(dayKey);
  return seller.physicalStartsMs.filter((ms) => ms >= start.getTime() && ms < end.getTime()).length;
}

/** Hver sælgers egne slots for dagen (med sælgerens 4-/3-møde-regel). */
function slotsPerSeller(
  dayKey: string,
  meetingType: MeetingType | string,
  sellers: SellerCalendar[],
  opts: MultiSellerOptions,
): { sellerId: string; slots: CopenhagenBookingSlotWithAvailability[] }[] {
  return sellers.flatMap((seller) => {
    const day = opts.forSeller?.(seller.sellerId) ?? {};
    if (day.closed) return [];
    return [
      {
        sellerId: seller.sellerId,
        slots: getCopenhagenBookingSlotsForMeetingType(
          dayKey,
          meetingType,
          seller.hardBlocks,
          seller.softBlocks,
          {
            physicalMeetingsBookedOnDay: physicalMeetingsOnDay(seller, dayKey),
            physicalMeetingsTarget: opts.physicalMeetingsTarget,
            earliestStartMin: day.earliestStartMin,
          },
        ),
      },
    ];
  });
}

/**
 * Ledige tider for dagen på tværs af sælgere: en tid er ledig, hvis mindst én sælger kan tage den,
 * og den tildeles den første (højest prioriterede) af dem.
 */
export function multiSellerSlots(
  dayKey: string,
  meetingType: MeetingType | string,
  sellers: SellerCalendar[],
  opts: MultiSellerOptions = {},
): SellerSlot[] {
  const byTime = new Map<number, SellerSlot>();
  for (const { sellerId, slots } of slotsPerSeller(dayKey, meetingType, sellers, opts)) {
    for (const s of slots) {
      const current = byTime.get(s.utcMs);
      if (!current) {
        byTime.set(s.utcMs, { ...s, sellerId: s.available ? sellerId : null });
      } else if (!current.available && s.available) {
        byTime.set(s.utcMs, { ...s, sellerId });
      }
    }
  }
  return [...byTime.values()].sort((a, b) => a.utcMs - b.utcMs);
}

/**
 * Hvem får et møde på `startMs`? Først som i tidsvælgeren (sælgerens slots med målet),
 * ellers den første sælger hvis kalender rent faktisk har plads (fx en admin-tid uden for gitteret).
 * null = ingen sælger har plads.
 */
export function pickSellerForMeeting(
  startMs: number,
  dayKey: string,
  meetingType: MeetingType | string,
  sellers: SellerCalendar[],
  opts: MultiSellerOptions = {},
): string | null {
  const slot = multiSellerSlots(dayKey, meetingType, sellers, opts).find(
    (s) => s.utcMs === startMs && s.available,
  );
  if (slot?.sellerId) return slot.sellerId;
  const open = sellers.find(
    (s) =>
      !opts.forSeller?.(s.sellerId).closed &&
      canBookMeetingAt(startMs, meetingType, s.hardBlocks, s.softBlocks),
  );
  return open?.sellerId ?? null;
}
