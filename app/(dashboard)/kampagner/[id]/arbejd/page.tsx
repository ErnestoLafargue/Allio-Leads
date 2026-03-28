"use client";

import { useParams } from "next/navigation";
import { asSingleParam } from "@/lib/route-params";
import { CampaignWorkspace } from "./campaign-workspace";

export default function KampagneArbejdPage() {
  const params = useParams<{ id: string }>();
  const id = asSingleParam(params.id);

  if (!id) {
    return <p className="text-stone-500">Indlæser…</p>;
  }

  return <CampaignWorkspace campaignId={id} />;
}
