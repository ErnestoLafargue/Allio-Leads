import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { isLeadStatus, type LeadStatus } from "@/lib/lead-status";
import { buildLeadOutcomeOnlyUpdate } from "@/lib/lead-outcome-only-update";
import { applyLeadCooldownResets } from "@/lib/lead-cooldown";
import { shouldLogOutcomeForLeaderboard } from "@/lib/lead-outcome-log";
import { isLockedByOtherUser, releaseExpiredLocksEverywhere } from "@/lib/lead-lock";
import { findLeadBookingOverlapInDb } from "@/lib/booking/overlap-db";
import { campaignIdForBookedMeetingOutcome } from "@/lib/meeting-campaign-routing";
import { ensureStandardCampaignId } from "@/lib/ensure-system-campaigns";
import { findBookingTimeConflict } from "@/lib/booking/availability";

const MAX_BULK = 500;

function isRealOutcomeStatus(status: string): boolean {
  return status !== "NEW" && status !== "CALLBACK_SCHEDULED";
}

export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;

  const body = await req.json().catch(() => null);
  const rawIds = body?.ids;
  const statusRaw = body?.status;
  const meetingScheduledFor =
    typeof body?.meetingScheduledFor === "string" ? body.meetingScheduledFor : undefined;

  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return NextResponse.json({ error: "Angiv mindst ét lead-id" }, { status: 400 });
  }
  const idList = [...new Set(rawIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0))];
  if (idList.length === 0) {
    return NextResponse.json({ error: "Ugyldige id'er" }, { status: 400 });
  }
  if (idList.length > MAX_BULK) {
    return NextResponse.json({ error: `Højst ${MAX_BULK} leads ad gangen` }, { status: 400 });
  }
  if (typeof statusRaw !== "string" || !isLeadStatus(statusRaw)) {
    return NextResponse.json({ error: "Ugyldigt udfald" }, { status: 400 });
  }
  const status = statusRaw as LeadStatus;

  if (status === "CALLBACK_SCHEDULED") {
    return NextResponse.json(
      { error: "Bulk-udfald understøtter ikke «Callback planlagt» — brug callback i kampagne-arbejdet." },
      { status: 400 },
    );
  }

  try {
    await applyLeadCooldownResets();
    await releaseExpiredLocksEverywhere(prisma);

    const existingRows = await prisma.lead.findMany({
      where: { id: { in: idList } },
    });

    if (existingRows.length !== idList.length) {
      return NextResponse.json(
        { error: "Et eller flere leads findes ikke (eller er slettet)." },
        { status: 404 },
      );
    }

    const now = new Date();
    for (const existing of existingRows) {
      if (isLockedByOtherUser(existing, userId, now)) {
        return NextResponse.json(
          {
            error: `Leadet «${existing.companyName}» er optaget (låst) af en anden bruger.`,
          },
          { status: 409 },
        );
      }
    }

    const updates: { id: string; data: Prisma.LeadUncheckedUpdateInput }[] = [];

    const logRows: { leadId: string; userId: string; status: string }[] = [];

    for (const existing of existingRows) {
      const built = buildLeadOutcomeOnlyUpdate(existing, status, meetingScheduledFor, userId);
      if (!built.ok) {
        return NextResponse.json(
          { error: `${built.error} (lead: ${existing.companyName || existing.id})` },
          { status: 400 },
        );
      }
      const data: Prisma.LeadUncheckedUpdateInput = { ...built.data };
      if (existing.status !== status && isRealOutcomeStatus(status)) {
        data.lastOutcomeAt = new Date();
      }
      if (status !== "NEW") {
        data.lockedByUserId = null;
        data.lockedAt = null;
        data.lockExpiresAt = null;
      }
      if (status === "MEETING_BOOKED") {
        const o = String(data.meetingOutcomeStatus ?? "PENDING");
        const cid = await campaignIdForBookedMeetingOutcome(o);
        if (cid) data.campaignId = cid;
      } else if (existing.status === "MEETING_BOOKED") {
        const sid = await ensureStandardCampaignId();
        if (sid) data.campaignId = sid;
      }
      updates.push({ id: existing.id, data });
      if (shouldLogOutcomeForLeaderboard(existing, status)) {
        logRows.push({ leadId: existing.id, userId, status });
      }
    }

    if (status === "MEETING_BOOKED") {
      type Proposal = { id: string; start: Date };
      const proposals: Proposal[] = [];
      for (const u of updates) {
        const sf = u.data.meetingScheduledFor;
        if (sf instanceof Date && !Number.isNaN(sf.getTime())) {
          proposals.push({ id: u.id, start: sf });
        }
      }
      for (const p of proposals) {
        const clash = await findLeadBookingOverlapInDb(p.start, { excludeLeadIds: idList });
        if (clash) {
          return NextResponse.json(
            {
              error:
                "Mindst ét tidspunkt overlapper et eksisterende møde (75 min før/efter start). Vælg andre tider.",
            },
            { status: 409 },
          );
        }
      }
      for (let i = 0; i < proposals.length; i++) {
        const a = proposals[i]!;
        for (let j = i + 1; j < proposals.length; j++) {
          const b = proposals[j]!;
          if (
            findBookingTimeConflict(a.start, [
              { id: b.id, meetingScheduledFor: b.start, meetingOutcomeStatus: "PENDING" },
            ])
          ) {
            return NextResponse.json(
              { error: "Flere valgte møder overlapper hinanden i tid (75 min før/efter pr. booking)." },
              { status: 409 },
            );
          }
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const u of updates) {
        await tx.lead.update({ where: { id: u.id }, data: u.data });
      }
      if (logRows.length > 0) {
        await tx.leadOutcomeLog.createMany({ data: logRows });
      }
    });

    return NextResponse.json({ ok: true, updated: updates.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Kunne ikke opdatere udfald", details: process.env.NODE_ENV === "development" ? msg : undefined },
      { status: 500 },
    );
  }
}
