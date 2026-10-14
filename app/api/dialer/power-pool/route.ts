import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { powerPoolCampaignIdsForUser } from "@/lib/campaign-access";

/** Pulje til «Power: alle tildelte» for den loggede bruger (assignments + POWER_DIALER). */
export async function GET() {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;
  const campaignIds = await powerPoolCampaignIdsForUser(userId);
  const anchorCampaignId = campaignIds[0] ?? null;
  return NextResponse.json({
    campaignIds,
    count: campaignIds.length,
    anchorCampaignId,
  });
}
