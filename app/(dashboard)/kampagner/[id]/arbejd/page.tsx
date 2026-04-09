"use client";

import { useParams, useSearchParams } from "next/navigation";
import { asSingleParam } from "@/lib/route-params";
import { CampaignWorkspace } from "./campaign-workspace";

export default function KampagneArbejdPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = asSingleParam(params.id);
  const preferredLeadId = searchParams.get("leadId")?.trim() ?? "";

  if (!id) {
    return <p className="text-stone-500">Indlæser…</p>;
  }

  return <CampaignWorkspace campaignId={id} preferredLeadId={preferredLeadId || undefined} />;
}
