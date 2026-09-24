import { prisma } from "@/lib/prisma";

/**
 * Tilføj et webhook-event til DialerCallLog.rawEventsJson i én atomisk SQL-sætning og dedupe på
 * event-id. Returnerer false, hvis eventet allerede er gemt (dublet) eller rækken ikke findes.
 */
export async function appendDialerEventOnce(
  callControlId: string,
  eventId: string | undefined,
  event: { type: string; id?: string; at: string; payload: unknown },
): Promise<boolean> {
  const eventJson = JSON.stringify([event]);
  if (eventId) {
    const probe = JSON.stringify([{ id: eventId }]);
    const updated = await prisma.$executeRaw`
      UPDATE "DialerCallLog"
      SET "rawEventsJson" = (COALESCE(NULLIF("rawEventsJson", ''), '[]')::jsonb || ${eventJson}::jsonb)::text
      WHERE "callControlId" = ${callControlId}
        AND NOT (COALESCE(NULLIF("rawEventsJson", ''), '[]')::jsonb @> ${probe}::jsonb)`;
    return updated > 0;
  }
  const updated = await prisma.$executeRaw`
    UPDATE "DialerCallLog"
    SET "rawEventsJson" = (COALESCE(NULLIF("rawEventsJson", ''), '[]')::jsonb || ${eventJson}::jsonb)::text
    WHERE "callControlId" = ${callControlId}`;
  return updated > 0;
}
