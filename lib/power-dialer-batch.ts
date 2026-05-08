/**
 * Atomisk reservation af leads til server-side dispatch (Power / Predictive).
 * Genbruger kø-filter, sortering og DialerQueueItem som soft-lock.
 */

import type { PrismaClient } from "@prisma/client";
import { getActiveCampaignLeads } from "@/lib/active-campaign-queue";
import { sortLeadsForCampaignCallQueue } from "@/lib/lead-queue";
import { getLeadIdsWithOutcomeLogToday } from "@/lib/lead-outcome-today";
import { filterLeadsByCampaignProtectedSetting } from "@/lib/reklamebeskyttet-filter";
import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";
import { QUEUE_RESERVATION_TTL_MS } from "@/lib/dialer-shared";

export type ClaimedDialerLead = {
  leadId: string;
  phone: string;
  e164: string;
  queueItemId: string;
};

type CampaignQueueFields = {
  id: string;
  fieldConfig: string;
  activeQueueFilter: string;
  includeProtectedBusinesses: boolean;
};

/**
 * Reservér op til `newCallsNeeded` leads med gyldige numre. Ved race på samme lead springes over.
 */
export async function claimDispatchLeadBatch(
  prisma: PrismaClient,
  params: {
    campaign: CampaignQueueFields;
    newCallsNeeded: number;
  },
): Promise<ClaimedDialerLead[]> {
  const { campaign, newCallsNeeded } = params;
  const campaignId = campaign.id;
  if (newCallsNeeded <= 0) return [];

  const queuedLeadIds = (
    await prisma.dialerQueueItem.findMany({
      where: { campaignId },
      select: { leadId: true },
    })
  ).map((q) => q.leadId);

  const candidatesRaw = await prisma.lead.findMany({
    where: {
      campaignId,
      status: "NEW",
      lockedByUserId: null,
      id: queuedLeadIds.length > 0 ? { notIn: queuedLeadIds } : undefined,
      callbackReservedByUserId: null,
    },
    select: {
      id: true,
      phone: true,
      companyName: true,
      industry: true,
      customFields: true,
      meetingScheduledFor: true,
      importedAt: true,
      lastOutcomeAt: true,
      lastDialAttemptAt: true,
    },
    orderBy: [{ importedAt: "asc" }],
    take: Math.min(500, Math.max(newCallsNeeded * 25, 50)),
  });

  const fieldConfigJson =
    typeof campaign.fieldConfig === "string" ? campaign.fieldConfig : "{}";
  const viewRaw =
    typeof campaign.activeQueueFilter === "string" ? campaign.activeQueueFilter : "{}";
  let pool = getActiveCampaignLeads(
    candidatesRaw.map((r) => ({
      id: r.id,
      industry: r.industry ?? "",
      customFields: r.customFields,
      meetingScheduledFor: r.meetingScheduledFor,
    })),
    fieldConfigJson,
    viewRaw,
  );
  const idSet = new Set(pool.map((p) => p.id));
  pool = filterLeadsByCampaignProtectedSetting(
    candidatesRaw.filter((r) => idSet.has(r.id)),
    campaign.includeProtectedBusinesses,
  ).map((r) => ({
    id: r.id,
    industry: r.industry ?? "",
    customFields: r.customFields,
    meetingScheduledFor: r.meetingScheduledFor,
  }));

  const outcomeToday = await getLeadIdsWithOutcomeLogToday(pool.map((p) => p.id));
  const byId = new Map(candidatesRaw.map((r) => [r.id, r]));
  const queueOrdered = sortLeadsForCampaignCallQueue(
    pool.map((p) => {
      const r = byId.get(p.id);
      return {
        id: p.id,
        status: "NEW" as const,
        hasOutcomeLogToday: outcomeToday.has(p.id),
        importedAt:
          r?.importedAt instanceof Date ? r.importedAt.toISOString() : String(r?.importedAt ?? ""),
        lastOutcomeAt:
          r?.lastOutcomeAt instanceof Date ? r.lastOutcomeAt.toISOString() : undefined,
        lastDialAttemptAt:
          r?.lastDialAttemptAt instanceof Date ? r.lastDialAttemptAt.toISOString() : undefined,
      };
    }),
  );
  const candidates = queueOrdered
    .map((row) => byId.get(row.id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  const expiresAt = new Date(Date.now() + QUEUE_RESERVATION_TTL_MS);
  const reserved: ClaimedDialerLead[] = [];

  for (const lead of candidates) {
    if (reserved.length >= newCallsNeeded) break;
    const e164 = normalizePhoneToE164ForDial(lead.phone);
    if (!e164) continue;
    try {
      const created = await prisma.$transaction(async (tx) => {
        const q = await tx.dialerQueueItem.create({
          data: {
            campaignId,
            leadId: lead.id,
            expiresAt,
          },
        });
        await tx.lead.update({
          where: { id: lead.id },
          data: { lastDialAttemptAt: new Date() },
        });
        return q;
      });
      reserved.push({
        leadId: lead.id,
        phone: lead.phone,
        e164,
        queueItemId: created.id,
      });
    } catch {
      continue;
    }
  }

  return reserved;
}
