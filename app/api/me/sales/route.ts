import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import {
  commissionKrForBookedDay,
  COMMISSION_REBOOKING_FLAT_KR,
  forventetProvisionKrForBookedDay,
  rateKrPerHeldMeeting,
} from "@/lib/commission";
import { resolveLeadCommissionDayKey } from "@/lib/lead-commission-day";
import {
  MEETING_OUTCOME_CANCELLED,
  MEETING_OUTCOME_HELD,
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_SALE,
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
        const commissionRows = meetings.map((m) => ({
          meetingOutcomeStatus: m.meetingOutcomeStatus,
          bookedFromRebookingCampaign: m.bookedFromRebookingCampaign,
        }));
        const possibleHeldCount = meetings.filter(
          (m) => normOutcome(m.meetingOutcomeStatus) !== MEETING_OUTCOME_CANCELLED,
        ).length;
        const possibleRebookingCount = meetings.filter(
          (m) =>
            normOutcome(m.meetingOutcomeStatus) !== MEETING_OUTCOME_CANCELLED &&
            m.bookedFromRebookingCampaign === true,
        ).length;
        const possibleStandardCount = possibleHeldCount - possibleRebookingCount;
        const forventetKr = forventetProvisionKrForBookedDay(commissionRows);
        forventetProvisionKr += forventetKr;

        const c = commissionKrForBookedDay(commissionRows);
        const currentKr = c.kr;
        tilUdbetalingKr += currentKr;

        let ratePerHeld = 0;
        let rateLabel: string | null = null;
        if (c.heldCount > 0) {
          if (c.heldRebookingCount > 0 && c.heldStandardCount > 0) {
            rateLabel = `Blandet (${COMMISSION_REBOOKING_FLAT_KR} kr + trappe)`;
            ratePerHeld = 0;
          } else if (c.heldRebookingCount > 0) {
            ratePerHeld = COMMISSION_REBOOKING_FLAT_KR;
            rateLabel = `${COMMISSION_REBOOKING_FLAT_KR} kr (genbooking)`;
          } else {
            ratePerHeld = c.ratePerHeldStandard;
            rateLabel = `${c.ratePerHeldStandard} kr`;
          }
        }

        const forventetRatePerMeeting =
          possibleStandardCount > 0 ? rateKrPerHeldMeeting(possibleStandardCount) : 0;

        return {
          dayKey,
          finalized: c.finalized,
          heldCount: c.heldCount,
          heldRebookingCount: c.heldRebookingCount,
          heldStandardCount: c.heldStandardCount,
          cancelledCount: c.cancelledCount,
          pendingCount: c.pendingCount,
          kr: currentKr,
          ratePerHeld,
          rateLabel,
          meetingCount: n,
          possibleHeldCount,
          possibleRebookingCount,
          possibleStandardCount,
          forventetKr,
          forventetRatePerMeeting,
        };
      })
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

    const stats = {
      totalBooked: rows.length,
      pending: rows.filter((r) => normOutcome(r.meetingOutcomeStatus) === MEETING_OUTCOME_PENDING).length,
      held: rows.filter((r) => normOutcome(r.meetingOutcomeStatus) === MEETING_OUTCOME_HELD).length,
      sale: rows.filter((r) => normOutcome(r.meetingOutcomeStatus) === MEETING_OUTCOME_SALE).length,
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
