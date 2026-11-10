/** Klient-sikker (ingen Prisma-import) — bruges både i API-ruter og i møde-listen i browseren. */

/** Antal dage hvor admin må ændre udfaldet efter selve mødetidspunktet (ikke booking-tidspunktet). */
export const MEETING_OUTCOME_LOCK_DAYS = 30;

/**
 * True hvis udfaldet er låst, fordi selve mødetiden ligger mere end MEETING_OUTCOME_LOCK_DAYS dage tilbage.
 * Bemærk: bygger på meetingScheduledFor (mødet) — IKKE meetingBookedAt (bookingen).
 * Et møde må altså gerne være booket for længe siden; det er kun selve mødedatoens alder, der låser udfaldet.
 * Bruges både på server (input-validering i PATCH) og klient (deaktiveret select + tooltip).
 */
export function isMeetingOutcomeLocked(
  meetingScheduledFor: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!meetingScheduledFor) return false;
  const scheduled =
    meetingScheduledFor instanceof Date ? meetingScheduledFor : new Date(meetingScheduledFor);
  if (Number.isNaN(scheduled.getTime())) return false;
  const cutoff = now.getTime() - MEETING_OUTCOME_LOCK_DAYS * 86_400_000;
  return scheduled.getTime() < cutoff;
}

