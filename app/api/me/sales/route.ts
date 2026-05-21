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
  MEETING_OUTCOME_REBOOK,
  MEETING_OUTCOME_SALE,
} from "@/lib/meeting-outcome";

function normOutcome(s: string | null | undefined) {
  return String(s ?? "").trim().toUpperCase() || MEETING_OUTCOME_PENDING;
}

type CommissionMeetingRow = {
  meetingOutcomeStatus: string;
  bookedFromRebookingCampaign: boolean;
};

type SalesLeadRow = {
  id: string;
  leadId: string;
  companyName: string;
  meetingScheduledFor: string | null;
  meetingBookedAt: string | null;
  meetingOutcomeStatus?: string;
  meetingCommissionDayKey?: string;
  archived?: boolean;
  campaign?: { name: string };
};

export async function GET() {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;

  try {
    const [activeLeads, archivedRecords] = await Promise.all([
      prisma.lead.findMany({
        where: { bookedByUserId: userId, meetingBookedAt: { not: null } },
        orderBy: [{ meetingScheduledFor: "asc" }],
        include: {
          campaign: { select: { id: true, name: true } },
          bookedByUser: { select: { id: true, name: true, username: true } },
        },
      }),
      prisma.leadMeetingRecord.findMany({
        where: { bookedByUserId: userId },
        orderBy: [{ meetingScheduledFor: "asc" }],
        include: {
          lead: {
            select: {
              id: true,
              companyName: true,
              campaign: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const commissionSources: (CommissionMeetingRow & { dayKey: string })[] = [];
    const leads: SalesLeadRow[] = [];

    for (const r of archivedRecords) {
      const dayKey = r.meetingCommissionDayKey.trim() || "UKENDT";
      commissionSources.push({
        meetingOutcomeStatus: r.meetingOutcomeStatus,
        bookedFromRebookingCampaign: r.bookedFromRebookingCampaign,
        dayKey,
      });
      leads.push({
        id: `archived:${r.id}`,
        leadId: r.leadId,
        companyName: r.lead.companyName,
        meetingScheduledFor: r.meetingScheduledFor.toISOString(),
        meetingBookedAt: r.meetingBookedAt.toISOString(),
        meetingOutcomeStatus: r.meetingOutcomeStatus,
        meetingCommissionDayKey: r.meetingCommissionDayKey,
        archived: true,
        campaign: r.lead.campaign ? { name: r.lead.campaign.name } : undefined,
      });
    }

    for (const r of activeLeads) {
      const dayKey = resolveLeadCommissionDayKey(r) || "UKENDT";
      commissionSources.push({
        meetingOutcomeStatus: r.meetingOutcomeStatus,
        bookedFromRebookingCampaign: r.bookedFromRebookingCampaign,
        dayKey,
      });
      leads.push({
        id: r.id,
        leadId: r.id,
        companyName: r.companyName,
        meetingScheduledFor: r.meetingScheduledFor?.toISOString() ?? null,
        meetingBookedAt: r.meetingBookedAt?.toISOString() ?? null,
        meetingOutcomeStatus: r.meetingOutcomeStatus,
        meetingCommissionDayKey: r.meetingCommissionDayKey,
        archived: false,
        campaign: r.campaign ? { name: r.campaign.name } : undefined,
      });
    }

    leads.sort((a, b) => {
      const ta = a.meetingScheduledFor ? new Date(a.meetingScheduledFor).getTime() : 0;
      const tb = b.meetingScheduledFor ? new Date(b.meetingScheduledFor).getTime() : 0;
      return ta - tb;
    });

    const byDay = new Map<string, CommissionMeetingRow[]>();
    for (const row of commissionSources) {
      if (!byDay.has(row.dayKey)) byDay.set(row.dayKey, []);
      byDay.get(row.dayKey)!.push(row);
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

    const allForStats = commissionSources.map((m) => ({
      meetingOutcomeStatus: m.meetingOutcomeStatus,
    }));

    const stats = {
      totalBooked: commissionSources.length,
      pending: allForStats.filter((r) => normOutcome(r.meetingOutcomeStatus) === MEETING_OUTCOME_PENDING)
        .length,
      held: allForStats.filter((r) => normOutcome(r.meetingOutcomeStatus) === MEETING_OUTCOME_HELD).length,
      rebook: allForStats.filter((r) => normOutcome(r.meetingOutcomeStatus) === MEETING_OUTCOME_REBOOK)
        .length,
      sale: allForStats.filter((r) => normOutcome(r.meetingOutcomeStatus) === MEETING_OUTCOME_SALE).length,
      cancelled: allForStats.filter(
        (r) => normOutcome(r.meetingOutcomeStatus) === MEETING_OUTCOME_CANCELLED,
      ).length,
    };

    return NextResponse.json({
      leads,
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
