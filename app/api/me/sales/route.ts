import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import {
  MEETING_OUTCOME_CANCELLED,
  MEETING_OUTCOME_HELD,
  MEETING_OUTCOME_IN_PROGRESS,
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_REBOOK,
  MEETING_OUTCOME_SALE,
} from "@/lib/meeting-outcome";
import { resolveMineSalgSalesUserId } from "@/lib/mine-salg-view-user";

function normOutcome(s: string | null | undefined) {
  return String(s ?? "").trim().toUpperCase() || MEETING_OUTCOME_PENDING;
}

type SalesLeadRow = {
  id: string;
  leadId: string;
  companyName: string;
  meetingContactName: string;
  meetingScheduledFor: string | null;
  meetingBookedAt: string | null;
  meetingOutcomeStatus?: string;
  archived?: boolean;
  campaign?: { name: string };
};

export async function GET(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const requestedUserId = new URL(req.url).searchParams.get("userId")?.trim() ?? "";
  const requestedUserExists = requestedUserId
    ? !!(await prisma.user.findUnique({
        where: { id: requestedUserId },
        select: { id: true },
      }))
    : false;

  const resolved = resolveMineSalgSalesUserId({
    sessionUserId: session!.user.id,
    sessionRole: session!.user.role,
    requestedUserId,
    requestedUserExists,
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const salesUserId = resolved.salesUserId;

  const viewingUser = await prisma.user.findUnique({
    where: { id: salesUserId },
    select: { id: true, name: true, username: true },
  });
  if (!viewingUser) {
    return NextResponse.json({ error: "Bruger findes ikke." }, { status: 400 });
  }

  try {
    const [activeLeads, archivedRecords] = await Promise.all([
      prisma.lead.findMany({
        where: { bookedByUserId: salesUserId, meetingBookedAt: { not: null } },
        orderBy: [{ meetingScheduledFor: "asc" }],
        include: {
          campaign: { select: { id: true, name: true } },
          bookedByUser: { select: { id: true, name: true, username: true } },
        },
      }),
      prisma.leadMeetingRecord.findMany({
        where: { bookedByUserId: salesUserId },
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

    const leads: SalesLeadRow[] = [];

    for (const r of archivedRecords) {
      leads.push({
        id: `archived:${r.id}`,
        leadId: r.leadId,
        companyName: r.lead.companyName,
        meetingContactName: r.meetingContactName.trim(),
        meetingScheduledFor: r.meetingScheduledFor.toISOString(),
        meetingBookedAt: r.meetingBookedAt.toISOString(),
        meetingOutcomeStatus: r.meetingOutcomeStatus,
        archived: true,
        campaign: r.lead.campaign ? { name: r.lead.campaign.name } : undefined,
      });
    }

    for (const r of activeLeads) {
      leads.push({
        id: r.id,
        leadId: r.id,
        companyName: r.companyName,
        meetingContactName: r.meetingContactName.trim(),
        meetingScheduledFor: r.meetingScheduledFor?.toISOString() ?? null,
        meetingBookedAt: r.meetingBookedAt?.toISOString() ?? null,
        meetingOutcomeStatus: r.meetingOutcomeStatus,
        archived: false,
        campaign: r.campaign ? { name: r.campaign.name } : undefined,
      });
    }

    leads.sort((a, b) => {
      const ta = a.meetingScheduledFor ? new Date(a.meetingScheduledFor).getTime() : 0;
      const tb = b.meetingScheduledFor ? new Date(b.meetingScheduledFor).getTime() : 0;
      return ta - tb;
    });

    const stats = {
      totalBooked: leads.length,
      pending: leads.filter((r) => normOutcome(r.meetingOutcomeStatus) === MEETING_OUTCOME_PENDING)
        .length,
      held: leads.filter((r) => normOutcome(r.meetingOutcomeStatus) === MEETING_OUTCOME_HELD).length,
      rebook: leads.filter((r) => normOutcome(r.meetingOutcomeStatus) === MEETING_OUTCOME_REBOOK)
        .length,
      sale: leads.filter((r) => normOutcome(r.meetingOutcomeStatus) === MEETING_OUTCOME_SALE).length,
      inProgress: leads.filter(
        (r) => normOutcome(r.meetingOutcomeStatus) === MEETING_OUTCOME_IN_PROGRESS,
      ).length,
      cancelled: leads.filter(
        (r) => normOutcome(r.meetingOutcomeStatus) === MEETING_OUTCOME_CANCELLED,
      ).length,
    };

    return NextResponse.json({
      leads,
      stats,
      viewingUser,
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
