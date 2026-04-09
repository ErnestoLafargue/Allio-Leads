import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { applyLeadCooldownResets } from "@/lib/lead-cooldown";
import { filterLeadsByCampaignProtectedSetting } from "@/lib/reklamebeskyttet-filter";
import { getLeadIdsWithOutcomeLogToday } from "@/lib/lead-outcome-today";
import { sortLeadsForCampaignCallQueue } from "@/lib/lead-queue";
import { MEETING_OUTCOME_CANCELLED, normalizeMeetingOutcomeStatus } from "@/lib/meeting-outcome";
import { releaseExpiredLocksEverywhere, tryAcquireLeadLock } from "@/lib/lead-lock";

type Params = { params: Promise<{ id: string }> };

const leadInclude = {
  bookedByUser: { select: { id: true, name: true, username: true } as const },
  campaign: { select: { id: true, name: true, fieldConfig: true } as const },
  lockedByUser: { select: { id: true, name: true, username: true } as const },
  callbackReservedByUser: { select: { id: true, name: true, username: true } as const },
} as const;

/**
 * Atomisk reservation: først alle aktive planlagte callbacks for denne bruger (på tværs af kampagner), derefter «Ny»-køen.
 * Post body (valgfri): { "preferLeadId": "…" } for at genåbne samme Ny-lead efter refresh (gælder ikke for callback-prioritet).
 * { "excludeLeadId": "…" } springer dette lead over i Ny-køen (fx efter «Gem og næste» med udfald Ny).
 */
export async function POST(req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;
  const campaignId = (await params).id;

  const body = await req.json().catch(() => null);
  const preferLeadId = typeof body?.preferLeadId === "string" ? body.preferLeadId.trim() : "";
  const excludeLeadId = typeof body?.excludeLeadId === "string" ? body.excludeLeadId.trim() : "";

  try {
    await applyLeadCooldownResets();
    await releaseExpiredLocksEverywhere(prisma);

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, includeProtectedBusinesses: true, systemCampaignType: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Kampagne findes ikke" }, { status: 404 });
    }
    if (
      campaign.systemCampaignType === "active_customers" &&
      session!.user.role !== "ADMIN"
    ) {
      return NextResponse.json(
        { error: "Kun administratorer kan arbejde i «Aktive kunder»." },
        { status: 403 },
      );
    }

    const now = new Date();

    async function tryReserve(id: string) {
      const ok = await tryAcquireLeadLock(prisma, id, userId, now);
      if (!ok) return null;
      const lead = await prisma.lead.findUnique({
        where: { id },
        include: leadInclude,
      });
      return lead;
    }

    const pendingCallbacks = await prisma.lead.findMany({
      where: {
        status: "CALLBACK_SCHEDULED",
        callbackStatus: "PENDING",
        callbackReservedByUserId: userId,
      },
      orderBy: { callbackScheduledFor: "asc" },
      select: { id: true },
    });

    for (const row of pendingCallbacks) {
      const got = await tryReserve(row.id);
      if (got) return NextResponse.json({ lead: got });
    }

    const rawQueue = await prisma.lead.findMany({
      where:
        campaign.systemCampaignType === "rebooking"
          ? {
              campaignId,
              status: "MEETING_BOOKED",
              meetingOutcomeStatus: MEETING_OUTCOME_CANCELLED,
            }
          : { campaignId, status: "NEW" },
      select: {
        id: true,
        status: true,
        meetingOutcomeStatus: true,
        importedAt: true,
        lastOutcomeAt: true,
        customFields: true,
      },
    });

    const filtered = filterLeadsByCampaignProtectedSetting(
      rawQueue.map((r) => ({ ...r, customFields: r.customFields })),
      campaign.includeProtectedBusinesses,
    );
    const outcomeToday = await getLeadIdsWithOutcomeLogToday(filtered.map((r) => r.id));
    const sorted = sortLeadsForCampaignCallQueue(
      filtered.map((r) => ({
        id: r.id,
        status:
          campaign.systemCampaignType === "rebooking" &&
          normalizeMeetingOutcomeStatus(r.meetingOutcomeStatus ?? "") === MEETING_OUTCOME_CANCELLED
            ? "NEW"
            : r.status,
        hasOutcomeLogToday: outcomeToday.has(r.id),
        importedAt:
          r.importedAt instanceof Date ? r.importedAt.toISOString() : String(r.importedAt),
        lastOutcomeAt:
          r.lastOutcomeAt instanceof Date ? r.lastOutcomeAt.toISOString() : undefined,
      })),
    );

    if (preferLeadId) {
      const allowed = new Set(sorted.map((r) => r.id));
      if (allowed.has(preferLeadId)) {
        const got = await tryReserve(preferLeadId);
        if (got) return NextResponse.json({ lead: got });
      }
    }

    for (const row of sorted) {
      if (excludeLeadId && row.id === excludeLeadId) continue;
      const got = await tryReserve(row.id);
      if (got) return NextResponse.json({ lead: got });
    }

    return NextResponse.json({ lead: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const migrationHint =
      msg.includes("lockedByUserId") ||
      msg.includes("lockExpiresAt") ||
      msg.includes("callbackScheduledFor") ||
      msg.includes("callbackReservedByUserId") ||
      msg.includes("lastOutcomeAt") ||
      msg.includes("no such column") ||
      msg.toLowerCase().includes("does not exist");
    return NextResponse.json(
      {
        error: migrationHint
          ? "Databasen matcher ikke den aktuelle kode (manglende kolonner). Kør «npm run db:migrate» i projektmappen (indlæser .env.local), eller «npx prisma migrate deploy» med DATABASE_URL sat — genstart derefter dev-serveren."
          : "Kunne ikke reservere lead.",
        details: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    );
  }
}
