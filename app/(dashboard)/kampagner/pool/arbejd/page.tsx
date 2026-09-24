"use client";

import { useSearchParams } from "next/navigation";
import { CampaignWorkspace } from "@/app/(dashboard)/kampagner/[id]/arbejd/campaign-workspace";

export default function PoolArbejdPage() {
  const searchParams = useSearchParams();
  const voipSessionRaw = searchParams.get("voipSession")?.trim().toLowerCase() ?? "";
  const voipSession = voipSessionRaw === "1" || voipSessionRaw === "true";

  return (
    <CampaignWorkspace
      campaignId=""
      poolMode
      voipSession={voipSession}
    />
  );
}
