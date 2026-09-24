/**
 * Atomisk reservation af leads til server-side dispatch (Power / Predictive).
 * Genbruger kø-filter, sortering og DialerQueueItem som soft-lock.
 */

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  getActiveCampaignLeads,
  parseActiveCampaignQueueView,
  sortLeadsByActivePostalQueue,
} from "@/lib/active-campaign-queue";
import { getLeadIdsWithOutcomeLogToday } from "@/lib/lead-outcome-today";
import { filterLeadsByCampaignProtectedSetting } from "@/lib/reklamebeskyttet-filter";
import { filterLeadsByCampaignPhoneSetting } from "@/lib/lead-phone-filter";
import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";
import { QUEUE_RESERVATION_TTL_MS } from "@/lib/dialer-shared";
import { unansweredAttemptsWithinMaxWhere } from "@/lib/lead-attempts";

export type ClaimedDialerLead = {
  leadId: string;
  phone: string;
  e164: string;
  queueItemId: string;
};

/** Kun Power Dialer: leads i cooldown efter usikkert AMD / no-bridge hangup må ikke claimes. */
export function powerDialerEligibleOrPastWhere(now: Date): Prisma.LeadWhereInput {
  return {
    OR: [
      { powerDialerEligibleAfter: { equals: null } },
      { powerDialerEligibleAfter: { lte: now } },
    ],
  };
}

type CampaignQueueFields = {
  id: string;
  fieldConfig: string;
  activeQueueFilter: string;
  includeProtectedBusinesses: boolean;
  includeLeadsWithoutPhone: boolean;
  maxContactAttempts: number | null;
};

/**
 * Reservér op til `newCallsNeeded` leads med gyldige numre. Ved race på samme lead springes over.
 */
export async function claimDispatchLeadBatch(
  prisma: PrismaClient,
  params: {
    campaign: CampaignQueueFields;
    newCallsNeeded: number;
    restrictPowerDialerEligibleAfter?: boolean;
  },
): Promise<ClaimedDialerLead[]> {
  const { campaign, newCallsNeeded, restrictPowerDialerEligibleAfter } = params;
  const campaignId = campaign.id;
  if (newCallsNeeded <= 0) return [];

  const now = new Date();

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
      ...(restrictPowerDialerEligibleAfter ? powerDialerEligibleOrPastWhere(now) : {}),
      ...unansweredAttemptsWithinMaxWhere(campaign.maxContactAttempts),
    },
    select: {
      id: true,
      phone: true,
      companyName: true,
      industry: true,
      customFields: true,
      meetingScheduledFor: true,
      postalCode: true,
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
  const serverView = parseActiveCampaignQueueView(viewRaw);
  let pool = getActiveCampaignLeads(
    candidatesRaw.map((r) => ({
      id: r.id,
      industry: r.industry ?? "",
      customFields: r.customFields,
      meetingScheduledFor: r.meetingScheduledFor,
      postalCode: r.postalCode ?? "",
    })),
    fieldConfigJson,
    viewRaw,
  );
  const idSet = new Set(pool.map((p) => p.id));
  pool = filterLeadsByCampaignPhoneSetting(
    filterLeadsByCampaignProtectedSetting(
      candidatesRaw.filter((r) => idSet.has(r.id)),
      campaign.includeProtectedBusinesses,
    ),
    campaign.includeLeadsWithoutPhone,
  ).map((r) => ({
    id: r.id,
    industry: r.industry ?? "",
    customFields: r.customFields,
    meetingScheduledFor: r.meetingScheduledFor,
    postalCode: r.postalCode ?? "",
  }));

  const outcomeToday = await getLeadIdsWithOutcomeLogToday(pool.map((p) => p.id));
  const byId = new Map(candidatesRaw.map((r) => [r.id, r]));
  const queueOrdered = sortLeadsByActivePostalQueue(
    pool.map((p) => {
      const r = byId.get(p.id);
      return {
        id: p.id,
        postalCode: p.postalCode ?? r?.postalCode ?? "",
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
    serverView,
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

export type PowerDialerCandidate = {
  leadId: string;
  e164: string;
  lastDialAttemptAt: Date | null;
};

type PowerCandidateCampaign = CampaignQueueFields;

/**
 * Power Dialer-kø i samme rækkefølge som den manuelle kø (kampagnens gemte filter + sortering):
 * Ny, ikke låst, ingen callback, ikke i cooldown, inden for maks. kontaktforsøg, ikke allerede i
 * dispatcherens kø. Returnerer op til `limit` leads med gyldigt nummer.
 */
export async function listPowerDialerCandidates(
  db: PrismaClient,
  params: { campaign: PowerCandidateCampaign; limit: number; now: Date },
): Promise<PowerDialerCandidate[]> {
  const { campaign, limit, now } = params;
  if (limit <= 0) return [];

  const rows = await db.lead.findMany({
    where: {
      campaignId: campaign.id,
      status: "NEW",
      lockedByUserId: null,
      callbackScheduledFor: null,
      callbackReservedByUserId: null,
      dialerQueueItem: { is: null },
      ...powerDialerEligibleOrPastWhere(now),
      ...unansweredAttemptsWithinMaxWhere(campaign.maxContactAttempts),
    },
    select: {
      id: true,
      phone: true,
      industry: true,
      customFields: true,
      meetingScheduledFor: true,
      postalCode: true,
      importedAt: true,
      lastOutcomeAt: true,
      lastDialAttemptAt: true,
    },
  });
  if (rows.length === 0) return [];

  const fieldConfigJson = typeof campaign.fieldConfig === "string" ? campaign.fieldConfig : "{}";
  const viewRaw = typeof campaign.activeQueueFilter === "string" ? campaign.activeQueueFilter : "{}";
  const serverView = parseActiveCampaignQueueView(viewRaw);
  const inView = getActiveCampaignLeads(
    rows.map((r) => ({
      ...r,
      industry: r.industry ?? "",
      postalCode: r.postalCode ?? "",
    })),
    fieldConfigJson,
    viewRaw,
  );
  const filtered = filterLeadsByCampaignPhoneSetting(
    filterLeadsByCampaignProtectedSetting(inView, campaign.includeProtectedBusinesses),
    campaign.includeLeadsWithoutPhone,
  );
  const outcomeToday = await getLeadIdsWithOutcomeLogToday(filtered.map((r) => r.id));
  const sorted = sortLeadsByActivePostalQueue(
    filtered.map((r) => ({
      id: r.id,
      postalCode: r.postalCode ?? "",
      status: "NEW" as const,
      hasOutcomeLogToday: outcomeToday.has(r.id),
      importedAt: r.importedAt.toISOString(),
      lastOutcomeAt: r.lastOutcomeAt ? r.lastOutcomeAt.toISOString() : undefined,
      lastDialAttemptAt: r.lastDialAttemptAt ? r.lastDialAttemptAt.toISOString() : undefined,
    })),
    serverView,
  );
  const byId = new Map(filtered.map((r) => [r.id, r]));
  const out: PowerDialerCandidate[] = [];
  for (const s of sorted) {
    if (out.length >= limit) break;
    const r = byId.get(s.id);
    if (!r) continue;
    const e164 = normalizePhoneToE164ForDial(r.phone);
    if (!e164) continue;
    out.push({ leadId: r.id, e164, lastDialAttemptAt: r.lastDialAttemptAt });
  }
  return out;
}

export type ClaimedPowerLead = PowerDialerCandidate & { queueItemId: string };

/**
 * Reservér kandidater atomisk (kaldes inde i dispatch-transaktionen under kampagnens advisory-lås):
 * leadet skal stadig være Ny og ulåst, og kø-reservationen oprettes med ON CONFLICT DO NOTHING.
 */
export async function claimPowerDialerLeads(
  tx: Prisma.TransactionClient,
  params: {
    campaignId: string;
    candidates: PowerDialerCandidate[];
    count: number;
    now: Date;
    expiresAt: Date;
  },
): Promise<ClaimedPowerLead[]> {
  const claimed: ClaimedPowerLead[] = [];
  for (const c of params.candidates) {
    if (claimed.length >= params.count) break;
    const upd = await tx.lead.updateMany({
      where: {
        id: c.leadId,
        campaignId: params.campaignId,
        status: "NEW",
        lockedByUserId: null,
        callbackReservedByUserId: null,
        ...powerDialerEligibleOrPastWhere(params.now),
      },
      data: { lastDialAttemptAt: params.now },
    });
    if (upd.count !== 1) continue;
    const id = randomUUID();
    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "DialerQueueItem" ("id", "campaignId", "leadId", "reservedAt", "expiresAt", "attempts")
      VALUES (${id}, ${params.campaignId}, ${c.leadId}, ${params.now}, ${params.expiresAt}, 0)
      ON CONFLICT ("leadId") DO NOTHING
      RETURNING "id"`;
    if (inserted.length !== 1) {
      await tx.lead.updateMany({
        where: { id: c.leadId, lastDialAttemptAt: params.now },
        data: { lastDialAttemptAt: c.lastDialAttemptAt },
      });
      continue;
    }
    claimed.push({ ...c, queueItemId: id });
  }
  return claimed;
}
