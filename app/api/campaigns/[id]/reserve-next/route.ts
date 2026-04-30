import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { applyLeadCooldownResets, markCallbackSeenByAssignee } from "@/lib/lead-cooldown";
import { filterLeadsByCampaignProtectedSetting } from "@/lib/reklamebeskyttet-filter";
import { getLeadIdsWithOutcomeLogToday } from "@/lib/lead-outcome-today";
import { isLeadInRebookingDialerPool, sortLeadsForCampaignCallQueue } from "@/lib/lead-queue";
import { MEETING_OUTCOME_REBOOK, normalizeMeetingOutcomeStatus } from "@/lib/meeting-outcome";
import { releaseExpiredLocksEverywhere, tryAcquireLeadLock } from "@/lib/lead-lock";
import {
  filterLeadsByWorkspaceStartDate,
  parseWorkspaceStartDateFilterFromRequestBody,
} from "@/lib/workspace-start-date-filter";
import { copenhagenDayKey } from "@/lib/copenhagen-day";
import {
  getActiveCampaignLeads,
  hasActiveQueueViewConstraints,
  parseActiveCampaignQueueView,
} from "@/lib/active-campaign-queue";

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
 * { "excludeLeadId": "…" } springer dette lead over i både tilbagekald-prioritet og Ny-køen (fx efter planlagt callback).
 */
export async function POST(req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;
  const campaignId = (await params).id;

  const body = await req.json().catch(() => null);
  const preferLeadId = typeof body?.preferLeadId === "string" ? body.preferLeadId.trim() : "";
  const excludeLeadId = typeof body?.excludeLeadId === "string" ? body.excludeLeadId.trim() : "";
  const rawExcludeLeadIds: unknown[] = Array.isArray(body?.excludeLeadIds) ? body.excludeLeadIds : [];
  const excludeLeadIds = rawExcludeLeadIds
        .filter((v: unknown): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
  const excludedLeadSet = new Set<string>([excludeLeadId, ...excludeLeadIds].filter(Boolean));
  const workspaceStartFilter = parseWorkspaceStartDateFilterFromRequestBody(body);
  if (
    workspaceStartFilter?.enabled &&
    workspaceStartFilter.from &&
    workspaceStartFilter.to &&
    workspaceStartFilter.from > workspaceStartFilter.to
  ) {
    return NextResponse.json(
      { error: "«Fra» skal være før eller samme dag som «til» (startdato-filter)." },
      { status: 400 },
    );
  }

  try {
    await applyLeadCooldownResets();
    await releaseExpiredLocksEverywhere(prisma);

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        includeProtectedBusinesses: true,
        systemCampaignType: true,
        fieldConfig: true,
        activeQueueFilter: true,
      },
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
      if (lead) {
        await prisma.leadVisitHistory.create({
          data: {
            leadId: lead.id,
            userId,
            campaignId: lead.campaign?.id ?? null,
            companyName: lead.companyName,
            statusAtVisit: lead.status,
            dayKey: copenhagenDayKey(now),
            visitedAt: now,
          },
        });
      }
      return lead;
    }

    const pendingCallbacks = await prisma.lead.findMany({
      where: {
        status: "CALLBACK_SCHEDULED",
        callbackStatus: "PENDING",
        callbackReservedByUserId: userId,
        /** Et tilbagekald må først komme tilbage i køen, når tidspunktet er nået. */
        callbackScheduledFor: { lte: now },
      },
      orderBy: { callbackScheduledFor: "asc" },
      select: { id: true },
    });

    for (const row of pendingCallbacks) {
      if (excludedLeadSet.has(row.id)) continue;
      const got = await tryReserve(row.id);
      if (got) {
        await markCallbackSeenByAssignee(got.id, userId);
        const refreshed = await prisma.lead.findUnique({
          where: { id: got.id },
          include: leadInclude,
        });
        return NextResponse.json({ lead: refreshed ?? got });
      }
    }

    /** «Ny» i køen må ikke have hængende tilbagekald-metadata (defensivt ved racedata / fejl). */
    const newInDialerPool = {
      status: "NEW" as const,
      callbackScheduledFor: null,
      callbackReservedByUserId: null,
    };

    const rawQueue = await prisma.lead.findMany({
      where:
        campaign.systemCampaignType === "rebooking"
          ? {
              campaignId,
              /** Afsluttede udfald skal aldrig trækkes som næste lead (ses stadig i kampagne-layout). */
              NOT: { status: { in: ["NOT_INTERESTED", "UNQUALIFIED"] } },
              OR: [
                { status: "MEETING_BOOKED", meetingOutcomeStatus: MEETING_OUTCOME_REBOOK },
                /** Efter opkald/gem som «Ny» (eller auto fra voicemail) — stadig under genbook-kampagnen */
                newInDialerPool,
              ],
            }
          : { campaignId, ...newInDialerPool },
      select: {
        id: true,
        status: true,
        meetingOutcomeStatus: true,
        importedAt: true,
        lastOutcomeAt: true,
        customFields: true,
        meetingScheduledFor: true,
        industry: true,
      },
    });

    const fieldConfigJson = typeof campaign.fieldConfig === "string" ? campaign.fieldConfig : "{}";
    const serverView = parseActiveCampaignQueueView(
      typeof campaign.activeQueueFilter === "string" ? campaign.activeQueueFilter : "{}",
    );
    const useServerView = hasActiveQueueViewConstraints(serverView);
    const mapped = rawQueue.map((r) => ({
      id: r.id,
      industry: r.industry,
      customFields: r.customFields,
      meetingScheduledFor: r.meetingScheduledFor,
      status: r.status,
      meetingOutcomeStatus: r.meetingOutcomeStatus,
      importedAt: r.importedAt,
      lastOutcomeAt: r.lastOutcomeAt,
    }));
    const afterStartDate = useServerView
      ? getActiveCampaignLeads(mapped, fieldConfigJson, campaign.activeQueueFilter)
      : filterLeadsByWorkspaceStartDate(mapped, fieldConfigJson, workspaceStartFilter);

    const filtered =
      campaign.systemCampaignType === "rebooking"
        ? afterStartDate
            .filter((r) => isLeadInRebookingDialerPool(r))
            .map((r) => ({ ...r, customFields: r.customFields }))
        : filterLeadsByCampaignProtectedSetting(
            afterStartDate.map((r) => ({ ...r, customFields: r.customFields })),
            campaign.includeProtectedBusinesses,
          );
    const outcomeToday = await getLeadIdsWithOutcomeLogToday(filtered.map((r) => r.id));
    const sorted = sortLeadsForCampaignCallQueue(
      filtered.map((r) => ({
        id: r.id,
        status:
          campaign.systemCampaignType === "rebooking" &&
          normalizeMeetingOutcomeStatus(r.meetingOutcomeStatus ?? "") === MEETING_OUTCOME_REBOOK
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
      if (excludedLeadSet.has(row.id)) continue;
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
      msg.includes("callbackSeenByAssigneeAt") ||
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
