import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { commissionKrForBookedDay, rateKrPerHeldMeeting } from "@/lib/commission";
import { resolveLeadCommissionDayKey } from "@/lib/lead-commission-day";
import {
  MEETING_OUTCOME_CANCELLED,
  MEETING_OUTCOME_HELD,
  MEETING_OUTCOME_PENDING,
} from "@/lib/meeting-outcome";

function normOutcome(s: string | null | undefined) {
  return String(s ?? "").trim().toUpperCase() || MEETING_OUTCOME_PENDING;
}

export async function GET() {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;

  try {
    const rows = await prisma.lead.findMany({
      where: { status: "MEETING_BOOKED", bookedByUserId: userId },
      orderBy: [{ meetingScheduledFor: "asc" }],
      include: {
        campaign: { select: { id: true, name: true } },
        bookedByUser: { select: { id: true, name: true, username: true } },
      },
    });

    const byDay = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = resolveLeadCommissionDayKey(r) || "UKENDT";
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(r);
    }

    let tilUdbetalingKr = 0;
    let forventetProvisionKr = 0;
    const daySummaries = [...byDay.entries()]
      .map(([dayKey, meetings]) => {
        const n = meetings.length;
        const forventetRatePerMeeting = rateKrPerHeldMeeting(n);
        const forventetKr = n * forventetRatePerMeeting;
        forventetProvisionKr += forventetKr;

        const c = commissionKrForBookedDay(
          meetings.map((m) => ({ meetingOutcomeStatus: m.meetingOutcomeStatus })),
        );
        if (c.finalized) tilUdbetalingKr += c.kr;
        return {
          dayKey,
          finalized: c.finalized,
          heldCount: c.heldCount,
          cancelledCount: c.cancelledCount,
          pendingCount: c.pendingCount,
          kr: c.kr,
          ratePerHeld: c.ratePerHeld,
          meetingCount: n,
          forventetKr,
          forventetRatePerMeeting,
        };
      })
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

    const stats = {
      totalBooked: rows.length,
      pending: rows.filter((r) => normOutcome(r.meetingOutcomeStatus) === MEETING_OUTCOME_PENDING).length,
      held: rows.filter((r) => normOutcome(r.meetingOutcomeStatus) === MEETING_OUTCOME_HELD).length,
      cancelled: rows.filter((r) => normOutcome(r.meetingOutcomeStatus) === MEETING_OUTCOME_CANCELLED).length,
    };

    return NextResponse.json({
      leads: rows,
      daySummaries,
      tilUdbetalingKr,
      forventetProvisionKr,
      stats,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const migrationHint = msg.includes("no such column") || msg.toLowerCase().includes("does not exist");
    return NextResponse.json(
      {
        error: migrationHint
          ? "Databasen er ikke opdateret. Kør «npx prisma migrate deploy» og genstart serveren."
          : "Kunne ikke hente salgsdata.",
        details: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    );
  }
}
