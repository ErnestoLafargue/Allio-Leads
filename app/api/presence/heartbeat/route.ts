import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { copenhagenDayKey } from "@/lib/copenhagen-day";

/**
 * Maks. sekunder ét heartbeat kan kreditere. Klienten pinger hvert ~60. sekund,
 * så et gap større end dette betyder at brugeren var væk (lukket fane, pause)
 * — den tid tæller ikke som login-/dialer-tid.
 */
const MAX_CREDIT_SECONDS = 150;

/**
 * POST /api/presence/heartbeat  { campaignId?: string }
 *
 * Dashboardet pinger mens fanen er synlig. Vi akkumulerer delta siden sidste
 * heartbeat (cappet) som login-tid, og — når brugeren står på en kampagnes
 * arbejdsside — som dialer-tid på den kampagne. Data gemmes pr. dag i
 * UserPresenceDay/UserCampaignPresenceDay og bruges af scoreboard + Plecto-eksport.
 */
export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const campaignId =
    typeof body?.campaignId === "string" && body.campaignId.trim()
      ? body.campaignId.trim()
      : null;

  const userId = session.user.id;
  const dayKey = copenhagenDayKey();
  const now = new Date();

  const existing = await prisma.userPresenceDay.findUnique({
    where: { userId_dayKey: { userId, dayKey } },
    select: { lastSeenAt: true },
  });
  const loginCredit = existing
    ? Math.min(
        Math.max(0, Math.round((now.getTime() - existing.lastSeenAt.getTime()) / 1000)),
        MAX_CREDIT_SECONDS,
      )
    : 0;
  await prisma.userPresenceDay.upsert({
    where: { userId_dayKey: { userId, dayKey } },
    create: { userId, dayKey, loginSeconds: 0, lastSeenAt: now },
    update: { loginSeconds: { increment: loginCredit }, lastSeenAt: now },
  });

  if (campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });
    if (campaign) {
      const existingCampaign = await prisma.userCampaignPresenceDay.findUnique({
        where: { userId_campaignId_dayKey: { userId, campaignId, dayKey } },
        select: { lastSeenAt: true },
      });
      const dialerCredit = existingCampaign
        ? Math.min(
            Math.max(
              0,
              Math.round((now.getTime() - existingCampaign.lastSeenAt.getTime()) / 1000),
            ),
            MAX_CREDIT_SECONDS,
          )
        : 0;
      await prisma.userCampaignPresenceDay.upsert({
        where: { userId_campaignId_dayKey: { userId, campaignId, dayKey } },
        create: { userId, campaignId, dayKey, dialerSeconds: 0, lastSeenAt: now },
        update: { dialerSeconds: { increment: dialerCredit }, lastSeenAt: now },
      });
    }
  }

  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
export const maxDuration = 15;
