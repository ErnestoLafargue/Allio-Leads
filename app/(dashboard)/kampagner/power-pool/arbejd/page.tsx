"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CampaignWorkspace } from "@/app/(dashboard)/kampagner/[id]/arbejd/campaign-workspace";

/**
 * Power-pulje: henter anker-kampagne (ældste tildelte POWER_DIALER) og åbner workspace
 * i powerPoolMode — samme Power-session ringer leads fra alle tildelte Power-kampagner.
 */
export default function PowerPoolArbejdPage() {
  const searchParams = useSearchParams();
  const voipSessionRaw = searchParams.get("voipSession")?.trim().toLowerCase() ?? "";
  const voipSession = voipSessionRaw === "1" || voipSessionRaw === "true";

  const [anchorCampaignId, setAnchorCampaignId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/dialer/power-pool");
        const j = (await res.json().catch(() => ({}))) as {
          anchorCampaignId?: string | null;
          count?: number;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(typeof j.error === "string" ? j.error : "Kunne ikke hente Power-puljen.");
          setAnchorCampaignId(null);
          return;
        }
        const anchor =
          typeof j.anchorCampaignId === "string" && j.anchorCampaignId.trim()
            ? j.anchorCampaignId.trim()
            : null;
        if (!anchor) {
          setError(
            "Ingen tildelte Power Dialer-kampagner. Uddel kampagner under Dialer → Uddel kampagner.",
          );
          setAnchorCampaignId(null);
          return;
        }
        setAnchorCampaignId(anchor);
      } catch {
        if (!cancelled) {
          setError("Kunne ikke hente Power-puljen.");
          setAnchorCampaignId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-stone-500">
        Indlæser Power-pulje…
      </div>
    );
  }

  if (error || !anchorCampaignId) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">{error ?? "Ingen Power-pulje."}</p>
      </div>
    );
  }

  return (
    <CampaignWorkspace
      campaignId={anchorCampaignId}
      powerPoolMode
      voipSession={voipSession}
    />
  );
}
