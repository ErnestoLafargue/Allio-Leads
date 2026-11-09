import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import { resolveFlowZoneUser } from "@/lib/flowzone/flowzone-user";
import { buildCallHistory, copenhagenDayAndBucket, GOOD_CONVERSATION_SECONDS } from "@/lib/flowzone/call-activity";

/** Et møde knyttes til sælgerens seneste opkald til leadet inden for så lang tid før bookingen. */
const SALE_CALL_WINDOW_MS = 3 * 60 * 60 * 1000;

/** Så langt tilbage hentes opkald. Rigeligt til at kunne bladre tilbage og stadig have 10 ringedage til gennemsnittet. */
const LOOKBACK_DAYS = 365;

/**
 * GET /api/flowzone/call-activity?userId= — brugerens (standard: den indloggede) opkald pr. kvarter pr. dag og bookede møder pr. dag for det seneste år.
 * Hentes én gang; FlowZone regner selv dag og gennemsnit ud, så dagskift er øjeblikkelige. Kun admin.
 */
export async function GET(req: Request) {
  const { userId, response } = await resolveFlowZoneUser(req);
  if (response) return response;

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const [calls, meetings] = await Promise.all([
    prisma.leadActivityEvent.findMany({
      where: { userId, kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT, createdAt: { gte: since } },
      select: { leadId: true, createdAt: true, durationSeconds: true },
    }),
    // Møder sælgeren har booket — ét pr. lead pr. dag, så en rettelse af udfaldet ikke tæller dobbelt
    prisma.leadOutcomeLog.findMany({
      where: { userId, status: "MEETING_BOOKED", createdAt: { gte: since } },
      select: { leadId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const callsByLead = new Map<string, number[]>();
  for (const c of calls) {
    const times = callsByLead.get(c.leadId) ?? [];
    times.push(c.createdAt.getTime());
    callsByLead.set(c.leadId, times);
  }

  // Mødet vises dér, hvor salgsopkaldet startede — ikke når udfaldet blev sat bagefter
  const seen = new Set<string>();
  const meetingTimes = meetings
    .filter((m) => {
      const key = `${m.leadId}|${copenhagenDayAndBucket(m.createdAt).dayKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((m) => {
      const booked = m.createdAt.getTime();
      const callStart = (callsByLead.get(m.leadId) ?? [])
        .filter((t) => t <= booked && t >= booked - SALE_CALL_WINDOW_MS)
        .reduce((latest, t) => Math.max(latest, t), 0);
      return new Date(callStart || booked);
    });

  // Gode samtaler: opkald med mindst 8 minutters samtale (varighed kendes kun når den er registreret)
  const goodConversationTimes = calls
    .filter((c) => (c.durationSeconds ?? 0) >= GOOD_CONVERSATION_SECONDS)
    .map((c) => c.createdAt);

  return NextResponse.json(buildCallHistory(calls.map((c) => c.createdAt), meetingTimes, goodConversationTimes), {
    headers: { "Cache-Control": "no-store" },
  });
}
