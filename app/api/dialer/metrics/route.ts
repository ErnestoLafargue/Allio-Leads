import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { PRESENCE_FRESH_WINDOW_MS } from "@/lib/dialer-shared";
import {
  countAmdMachineInWindow,
  countBridgesInWindow,
  countNoAgentAbandonsInWindow,
  DIALER_ABANDON_TARGET,
  getTargetPacingRatioAndStats,
  MIN_PACING_SAMPLE_BEFORE_TUNE,
  PACING_WINDOW_MS,
} from "@/lib/dialer-pacing";
import { normalizeCampaignDialMode } from "@/lib/dial-mode";
import { getPowerCampaignStats, loadPowerCampaign } from "@/lib/power-dialer-engine";
import { POWER_DROP_BRAKE_MIN_SAMPLE, POWER_DROP_BRAKE_WINDOW_MS } from "@/lib/power-dialer-constants";
import { POWER_RESOLUTIONS } from "@/lib/power-dialer-outcomes";

/**
 * GET ?campaignId=... — admin: aggregerede dialer-metrics til dashboard.
 */
export async function GET(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId")?.trim() ?? "";
  if (!campaignId) {
    return NextResponse.json({ error: "campaignId er påkrævet" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, dialMode: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Kampagne findes ikke" }, { status: 404 });
  }

  const mode = normalizeCampaignDialMode(campaign.dialMode);
  const since = new Date(Date.now() - PACING_WINDOW_MS);

  if (mode === "POWER_DIALER") {
    const power = await loadPowerCampaign(campaignId);
    if (!power) return NextResponse.json({ error: "Kampagne findes ikke" }, { status: 404 });
    const [stats, bridges1h, amd1h, resolutions] = await Promise.all([
      getPowerCampaignStats(power),
      countBridgesInWindow(prisma, { campaignId, since }),
      countAmdMachineInWindow(prisma, { campaignId, since }),
      prisma.dialerCallLog.groupBy({
        by: ["resolution"],
        where: { campaignId, direction: "outbound-lead", resolvedAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);
    const byResolution = Object.fromEntries(POWER_RESOLUTIONS.map((r) => [r, 0])) as Record<string, number>;
    for (const row of resolutions) {
      if (row.resolution) byResolution[row.resolution] = row._count._all;
    }
    return NextResponse.json({
      campaign: { id: campaign.id, name: campaign.name, dialMode: mode },
      power: {
        settings: power.settings,
        stats,
        brake: {
          windowMs: POWER_DROP_BRAKE_WINDOW_MS,
          minSample: POWER_DROP_BRAKE_MIN_SAMPLE,
        },
        lastHour: {
          bridges: bridges1h,
          amdMachineOrFax: amd1h,
          byResolution,
        },
      },
    });
  }

  const cutoff = new Date(Date.now() - PRESENCE_FRESH_WINDOW_MS);

  const [
    readyCount,
    ringingCount,
    talkingCount,
    inFlightCalls,
    bridges1h,
    noAgent1h,
    vm1h,
  ] = await Promise.all([
    prisma.agentSession.count({
      where: { campaignId, status: "ready", lastHeartbeat: { gte: cutoff } },
    }),
    prisma.agentSession.count({
      where: { campaignId, status: "ringing", lastHeartbeat: { gte: cutoff } },
    }),
    prisma.agentSession.count({
      where: { campaignId, status: "talking", lastHeartbeat: { gte: cutoff } },
    }),
    prisma.dialerCallLog.count({
      where: {
        campaignId,
        direction: "outbound-lead",
        state: { in: ["initiated", "ringing", "answered"] },
        endedAt: null,
      },
    }),
    countBridgesInWindow(prisma, { campaignId, since }),
    countNoAgentAbandonsInWindow(prisma, { campaignId, since }),
    countAmdMachineInWindow(prisma, { campaignId, since }),
  ]);

  const pacing =
    mode === "PREDICTIVE"
      ? await getTargetPacingRatioAndStats(prisma, { campaignId, dialMode: "PREDICTIVE" })
      : {
          ratio: 0,
          abandonRate: null as number | null,
          sampleSize: 0,
          bridgeCount: bridges1h,
          noAgentAbandonCount: noAgent1h,
          heldLowSample: false,
        };

  return NextResponse.json({
    campaign: { id: campaign.id, name: campaign.name, dialMode: mode },
    window: { ms: PACING_WINDOW_MS, targetAbandonRate: DIALER_ABANDON_TARGET },
    agents: { ready: readyCount, ringing: ringingCount, talking: talkingCount },
    calls: {
      inFlight: inFlightCalls,
      bridges1h,
      noAgentAbandons1h: noAgent1h,
      amdMachineOrFax1h: vm1h,
    },
    pacing: {
      ratio: pacing.ratio,
      abandonRate1h: pacing.abandonRate,
      sampleSize1h: pacing.sampleSize,
      bridges1h: pacing.bridgeCount,
      noAgentAbandons1h: pacing.noAgentAbandonCount,
      minSampleBeforeTune: MIN_PACING_SAMPLE_BEFORE_TUNE,
      heldLowSample: pacing.heldLowSample,
    },
  });
}

export const runtime = "nodejs";
