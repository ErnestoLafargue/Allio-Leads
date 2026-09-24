import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { markCallbackSeenByAssignee } from "@/lib/lead-cooldown";
import { filterLeadsByCampaignProtectedSetting } from "@/lib/reklamebeskyttet-filter";
import { filterLeadsByCampaignPhoneSetting } from "@/lib/lead-phone-filter";
import { getLeadIdsWithOutcomeLogToday } from "@/lib/lead-outcome-today";
import { isLeadInRebookingDialerPool } from "@/lib/lead-queue";
import { MEETING_OUTCOME_REBOOK, normalizeMeetingOutcomeStatus } from "@/lib/meeting-outcome";
import { releaseLeadLock, tryAcquireLeadLock } from "@/lib/lead-lock";
import {
  filterLeadsByWorkspaceStartDate,
  type WorkspaceStartDateFilterState,
} from "@/lib/workspace-start-date-filter";
import { copenhagenDayKey } from "@/lib/copenhagen-day";
import {
  getActiveCampaignLeads,
  hasActiveQueueViewConstraints,
  parseActiveCampaignQueueView,
  sortLeadsByActivePostalQueue,
} from "@/lib/active-campaign-queue";
import { normalizeCampaignDialMode } from "@/lib/dial-mode";
import { powerDialerEligibleOrPastWhere } from "@/lib/power-dialer-batch";
import { unansweredAttemptsWithinMaxWhere } from "@/lib/lead-attempts";
import { LEAD_VISIT_DEDUPE_WINDOW_MS } from "@/lib/lead-visit-dedupe";

export const reserveLeadInclude = {
  bookedByUser: { select: { id: true, name: true, username: true } as const },
  campaign: { select: { id: true, name: true, fieldConfig: true } as const },
  lockedByUser: { select: { id: true, name: true, username: true } as const },
  callbackReservedByUser: { select: { id: true, name: true, username: true } as const },
} as const;

export type ReservedLead = NonNullable<
  Awaited<ReturnType<typeof findReservedLead>>
>;

async function findReservedLead(db: PrismaClient, id: string) {
  return db.lead.findUnique({
    where: { id },
    include: reserveLeadInclude,
  });
}

export type ReserveCampaignSlice = {
  id: string;
  dialMode: string | null;
  includeProtectedBusinesses: boolean;
  includeLeadsWithoutPhone: boolean;
  systemCampaignType: string | null;
  fieldConfig: string | null;
  activeQueueFilter: string | null;
  maxContactAttempts: number | null;
};

export type TryReserveLeadOpts = {
  db?: PrismaClient;
  leadId: string;
  userId: string;
  now: Date;
  systemCampaignType: string | null;
  /**
   * Bruger har valgt dette lead eksplicit (klik i listen / leadId i URL).
   * Spring kø-krav over, så voicemail m.m. ikke erstattes af næste «Ny».
   */
  explicitOpen?: boolean;
};

/** Lock + validate + visit history. Returns lead or null. */
export async function tryReserveLead(opts: TryReserveLeadOpts): Promise<ReservedLead | null> {
  const db = opts.db ?? defaultPrisma;
  const { leadId, userId, now, systemCampaignType, explicitOpen } = opts;
  const ok = await tryAcquireLeadLock(db, leadId, userId, now);
  if (!ok) return null;
  const lead = await findReservedLead(db, leadId);
  if (!lead) return null;

  const isCallbackCandidate =
    lead.status === "CALLBACK_SCHEDULED" &&
    lead.callbackStatus === "PENDING" &&
    lead.callbackReservedByUserId === userId;

  if (!explicitOpen && !isCallbackCandidate) {
    if (systemCampaignType === "rebooking") {
      if (
        !isLeadInRebookingDialerPool({
          status: lead.status,
          meetingOutcomeStatus: lead.meetingOutcomeStatus,
        })
      ) {
        await releaseLeadLock(db, leadId, userId);
        return null;
      }
    } else if (
      lead.status !== "NEW" ||
      lead.callbackScheduledFor != null ||
      lead.callbackReservedByUserId != null
    ) {
      await releaseLeadLock(db, leadId, userId);
      return null;
    }
  }

  const recentVisit = await db.leadVisitHistory.findFirst({
    where: {
      leadId: lead.id,
      userId,
      visitedAt: { gte: new Date(now.getTime() - LEAD_VISIT_DEDUPE_WINDOW_MS) },
    },
    select: { id: true },
  });

  if (!recentVisit) {
    await db.leadVisitHistory.create({
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

export type ReservePendingCallbacksOpts = {
  db?: PrismaClient;
  userId: string;
  now: Date;
  excludedLeadIds: Set<string>;
  /**
   * `null` = alle kampagner (single-campaign reserve-next adfærd).
   * Ellers kun callbacks hvis lead.campaignId er i sættet (pool).
   */
  allowedCampaignIds: Set<string> | null;
  /** systemCampaignType lookup per campaignId when locking (rebooking check). */
  systemCampaignTypeByCampaignId?: Map<string, string | null>;
};

/** Første due callback for brugeren (eventuelt begrænset til pulje-kampagner). */
export async function reserveNextPendingCallback(
  opts: ReservePendingCallbacksOpts,
): Promise<ReservedLead | null> {
  const db = opts.db ?? defaultPrisma;
  const { userId, now, excludedLeadIds, allowedCampaignIds } = opts;

  const pendingCallbacks = await db.lead.findMany({
    where: {
      status: "CALLBACK_SCHEDULED",
      callbackStatus: "PENDING",
      callbackReservedByUserId: userId,
      callbackScheduledFor: { lte: now },
      ...(allowedCampaignIds
        ? { campaignId: { in: [...allowedCampaignIds] } }
        : {}),
    },
    orderBy: { callbackScheduledFor: "asc" },
    select: { id: true, campaignId: true },
  });

  for (const row of pendingCallbacks) {
    if (excludedLeadIds.has(row.id)) continue;
    const systemType =
      row.campaignId && opts.systemCampaignTypeByCampaignId
        ? (opts.systemCampaignTypeByCampaignId.get(row.campaignId) ?? null)
        : null;
    const got = await tryReserveLead({
      db,
      leadId: row.id,
      userId,
      now,
      systemCampaignType: systemType,
    });
    if (got) {
      await markCallbackSeenByAssignee(got.id, userId);
      const refreshed = await findReservedLead(db, got.id);
      return refreshed ?? got;
    }
  }
  return null;
}

export type ReserveNewFromCampaignOpts = {
  db?: PrismaClient;
  userId: string;
  now: Date;
  campaign: ReserveCampaignSlice;
  preferLeadId?: string;
  excludedLeadIds: Set<string>;
  workspaceStartFilter: WorkspaceStartDateFilterState | null;
};

/** «Ny»-kø for én kampagne (activeQueueFilter / startdato / phone / postal). */
export async function reserveNextNewLeadFromCampaign(
  opts: ReserveNewFromCampaignOpts,
): Promise<ReservedLead | null> {
  const db = opts.db ?? defaultPrisma;
  const { userId, now, campaign, preferLeadId, excludedLeadIds, workspaceStartFilter } = opts;

  const powerDialEligible =
    normalizeCampaignDialMode(campaign.dialMode) === "POWER_DIALER"
      ? powerDialerEligibleOrPastWhere(now)
      : {};
  const contactAttemptsEligible = unansweredAttemptsWithinMaxWhere(campaign.maxContactAttempts);

  const newInDialerPool = {
    status: "NEW" as const,
    callbackScheduledFor: null,
    callbackReservedByUserId: null,
  };
  // Leads som Power Dialer-dispatcheren er ved at ringe op, må ikke også åbnes manuelt (dobbelt-opkald).
  const notInDialerQueue = {
    AND: [
      {
        OR: [
          { dialerQueueItem: { is: null } },
          { dialerQueueItem: { is: { expiresAt: { lte: now }, connectedAt: null } } },
        ],
      },
    ],
  };

  const rawQueue = await db.lead.findMany({
    where:
      campaign.systemCampaignType === "rebooking"
        ? {
            campaignId: campaign.id,
            NOT: { status: { in: ["NOT_INTERESTED", "UNQUALIFIED"] } },
            OR: [
              { status: "MEETING_BOOKED", meetingOutcomeStatus: MEETING_OUTCOME_REBOOK },
              newInDialerPool,
            ],
            ...powerDialEligible,
            ...contactAttemptsEligible,
            ...notInDialerQueue,
          }
        : {
            campaignId: campaign.id,
            ...newInDialerPool,
            ...powerDialEligible,
            ...contactAttemptsEligible,
            ...notInDialerQueue,
          },
    select: {
      id: true,
      status: true,
      meetingOutcomeStatus: true,
      importedAt: true,
      lastOutcomeAt: true,
      lastDialAttemptAt: true,
      unansweredAttempts: true,
      customFields: true,
      phone: true,
      meetingScheduledFor: true,
      industry: true,
      postalCode: true,
      address: true,
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
    phone: r.phone,
    meetingScheduledFor: r.meetingScheduledFor,
    postalCode: r.postalCode,
    address: r.address,
    status: r.status,
    meetingOutcomeStatus: r.meetingOutcomeStatus,
    importedAt: r.importedAt,
    lastOutcomeAt: r.lastOutcomeAt,
    lastDialAttemptAt: r.lastDialAttemptAt,
    unansweredAttempts: r.unansweredAttempts,
  }));
  const afterStartDate = useServerView
    ? getActiveCampaignLeads(mapped, fieldConfigJson, campaign.activeQueueFilter)
    : filterLeadsByWorkspaceStartDate(mapped, fieldConfigJson, workspaceStartFilter);

  const filtered = filterLeadsByCampaignPhoneSetting(
    campaign.systemCampaignType === "rebooking"
      ? afterStartDate
          .filter((r) => isLeadInRebookingDialerPool(r))
          .map((r) => ({ ...r, customFields: r.customFields, phone: r.phone }))
      : filterLeadsByCampaignProtectedSetting(
          afterStartDate.map((r) => ({ ...r, customFields: r.customFields, phone: r.phone })),
          campaign.includeProtectedBusinesses,
        ),
    campaign.includeLeadsWithoutPhone,
  );
  const outcomeToday = await getLeadIdsWithOutcomeLogToday(filtered.map((r) => r.id));
  const sorted = sortLeadsByActivePostalQueue(
    filtered.map((r) => ({
      id: r.id,
      postalCode: r.postalCode ?? "",
      address: (r as { address?: string | null }).address ?? "",
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
      lastDialAttemptAt:
        r.lastDialAttemptAt instanceof Date ? r.lastDialAttemptAt.toISOString() : undefined,
      unansweredAttempts: r.unansweredAttempts,
    })),
    serverView,
  );

  const prefer = preferLeadId?.trim() ?? "";
  if (prefer) {
    const allowed = new Set(sorted.map((r) => r.id));
    if (allowed.has(prefer)) {
      const got = await tryReserveLead({
        db,
        leadId: prefer,
        userId,
        now,
        systemCampaignType: campaign.systemCampaignType,
      });
      if (got) return got;
    }
  }

  for (const row of sorted) {
    if (excludedLeadIds.has(row.id)) continue;
    const got = await tryReserveLead({
      db,
      leadId: row.id,
      userId,
      now,
      systemCampaignType: campaign.systemCampaignType,
    });
    if (got) return got;
  }
  return null;
}

export const campaignReserveSelect = {
  id: true,
  dialMode: true,
  includeProtectedBusinesses: true,
  includeLeadsWithoutPhone: true,
  systemCampaignType: true,
  fieldConfig: true,
  activeQueueFilter: true,
  maxContactAttempts: true,
} as const;
