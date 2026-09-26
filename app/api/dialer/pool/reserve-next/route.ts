import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { applyLeadCooldownResets } from "@/lib/lead-cooldown";
import { releaseExpiredLocksEverywhere, releaseLeadLock } from "@/lib/lead-lock";
import { dialPoolCampaignIdsForUser } from "@/lib/campaign-access";
import { normalizeCampaignDialMode } from "@/lib/dial-mode";
import { compareLeadQueueOrder } from "@/lib/lead-queue";
import {
  campaignReserveSelect,
  loadSortedNewLeadsForCampaign,
  reserveNextNewLeadFromCampaign,
  reserveNextPendingCallback,
  tryReserveLead,
} from "@/lib/campaign-queue-reserve";

/**
 * Reserver næste lead fra «Ring alle tildelte»-puljen.
 * Pulje = CampaignAssignment + CLICK_TO_CALL|PREDICTIVE (ingen admin-bypass).
 * Default: færrest kontaktforsøg først på tværs af tildelte kampagner; ældst sidste
 * forsøg ved lige. Hver kampagnes activeQueueFilter gælder.
 */
export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;

  const body = await req.json().catch(() => null);
  const preferLeadId = typeof body?.preferLeadId === "string" ? body.preferLeadId.trim() : "";
  const explicitLeadId = typeof body?.explicitLeadId === "string" ? body.explicitLeadId.trim() : "";
  const excludeLeadId = typeof body?.excludeLeadId === "string" ? body.excludeLeadId.trim() : "";
  const afterCampaignId =
    typeof body?.afterCampaignId === "string" ? body.afterCampaignId.trim() : "";
  void afterCampaignId;
  const rawExcludeLeadIds: unknown[] = Array.isArray(body?.excludeLeadIds) ? body.excludeLeadIds : [];
  const excludeLeadIds = rawExcludeLeadIds
    .filter((v: unknown): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
  const excludedLeadSet = new Set<string>([excludeLeadId, ...excludeLeadIds].filter(Boolean));

  try {
    const poolIds = await dialPoolCampaignIdsForUser(userId);
    if (poolIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "Ingen tildelte klik-til-opkald/predictive-kampagner. Uddel kampagner under Dialer → Uddel kampagner.",
          lead: null,
        },
        { status: 403 },
      );
    }

    await applyLeadCooldownResets();
    await releaseExpiredLocksEverywhere(prisma);

    const campaigns = await prisma.campaign.findMany({
      where: { id: { in: poolIds } },
      select: campaignReserveSelect,
    });
    const byId = new Map(campaigns.map((c) => [c.id, c]));
    const systemByCampaign = new Map(
      campaigns.map((c) => [c.id, c.systemCampaignType] as const),
    );
    const now = new Date();
    const allowedSet = new Set(poolIds);

    if (explicitLeadId) {
      const preferLead = await prisma.lead.findUnique({
        where: { id: explicitLeadId },
        select: { id: true, campaignId: true },
      });
      const preferCid = preferLead?.campaignId ?? null;
      const camp = preferCid ? byId.get(preferCid) : null;
      if (preferCid && allowedSet.has(preferCid) && camp) {
        const got = await tryReserveLead({
          leadId: explicitLeadId,
          userId,
          now,
          systemCampaignType: camp.systemCampaignType,
          explicitOpen: true,
        });
        if (got) {
          return NextResponse.json({
            lead: got,
            campaignId: camp.id,
            dialMode: normalizeCampaignDialMode(camp.dialMode),
          });
        }
      }
      if (preferCid) {
        await releaseLeadLock(prisma, explicitLeadId, userId);
      }
      return NextResponse.json(
        { error: "Kunne ikke åbne det valgte lead.", lead: null },
        { status: 409 },
      );
    }

    const callbackLead = await reserveNextPendingCallback({
      userId,
      now,
      excludedLeadIds: excludedLeadSet,
      allowedCampaignIds: allowedSet,
      systemCampaignTypeByCampaignId: systemByCampaign,
    });
    if (callbackLead) {
      const cid = callbackLead.campaign?.id ?? callbackLead.campaignId;
      if (!cid) {
        return NextResponse.json({ lead: callbackLead, campaignId: null, dialMode: null });
      }
      const camp = byId.get(cid);
      return NextResponse.json({
        lead: callbackLead,
        campaignId: cid,
        dialMode: normalizeCampaignDialMode(camp?.dialMode),
      });
    }

    if (preferLeadId) {
      const preferLead = await prisma.lead.findUnique({
        where: { id: preferLeadId },
        select: { id: true, campaignId: true },
      });
      const preferCid = preferLead?.campaignId ?? null;
      if (preferCid && allowedSet.has(preferCid)) {
        const camp = byId.get(preferCid);
        if (camp) {
          const got = await reserveNextNewLeadFromCampaign({
            userId,
            now,
            campaign: camp,
            preferLeadId,
            excludedLeadIds: excludedLeadSet,
            workspaceStartFilter: null,
          });
          if (got) {
            return NextResponse.json({
              lead: got,
              campaignId: camp.id,
              dialMode: normalizeCampaignDialMode(camp.dialMode),
            });
          }
        }
      }
    }

    const queued = (
      await Promise.all(
        campaigns.map((camp) =>
          loadSortedNewLeadsForCampaign({
            now,
            campaign: camp,
            workspaceStartFilter: null,
          }),
        ),
      )
    ).flat();
    if (campaigns.length > 1) {
      queued.sort(compareLeadQueueOrder);
    }

    for (const row of queued) {
      if (excludedLeadSet.has(row.id)) continue;
      const camp = byId.get(row.campaignId);
      if (!camp) continue;
      const got = await tryReserveLead({
        userId,
        now,
        leadId: row.id,
        systemCampaignType: camp.systemCampaignType,
      });
      if (got) {
        return NextResponse.json({
          lead: got,
          campaignId: camp.id,
          dialMode: normalizeCampaignDialMode(camp.dialMode),
        });
      }
    }

    return NextResponse.json({ lead: null, campaignId: null, dialMode: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const migrationHint =
      msg.includes("lockedByUserId") ||
      msg.includes("lockExpiresAt") ||
      msg.includes("callbackScheduledFor") ||
      msg.includes("callbackReservedByUserId") ||
      msg.includes("no such column") ||
      msg.toLowerCase().includes("does not exist");
    return NextResponse.json(
      {
        error: migrationHint
          ? "Databasen matcher ikke den aktuelle kode (manglende kolonner). Kør «npm run db:migrate»."
          : "Kunne ikke reservere lead fra puljen.",
        details: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    );
  }
}
