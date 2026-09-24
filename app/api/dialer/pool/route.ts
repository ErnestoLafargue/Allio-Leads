import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { dialPoolCampaignIdsForUser } from "@/lib/campaign-access";

/** Pulje til «Ring alle tildelte» for den loggede bruger (assignments + C2C/Predictive). */
export async function GET() {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;
  const campaignIds = await dialPoolCampaignIdsForUser(userId);
  return NextResponse.json({ campaignIds, count: campaignIds.length });
}
