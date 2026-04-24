"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type CampaignRow = { id: string; name: string; dialMode: string };

type MetricsBody = {
  campaign: { id: string; name: string; dialMode: string };
  window: { ms: number; targetAbandonRate: number };
  agents: { ready: number; ringing: number; talking: number };
  calls: {
    inFlight: number;
    bridges1h: number;
    noAgentAbandons1h: number;
    amdMachineOrFax1h: number;
  };
  pacing: {
    ratio: number;
    abandonRate1h: number | null;
    sampleSize1h: number;
    bridges1h: number;
    noAgentAbandons1h: number;
  };
};

export default function DialerMetricsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [metrics, setMetrics] = useState<MetricsBody | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!session || session.user.role !== "ADMIN") {
      router.replace("/leads");
    }
  }, [session, status, router]);

  useEffect(() => {
    if (status !== "authenticated" || session?.user.role !== "ADMIN") return;
    void fetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => {
        const rows = Array.isArray(d) ? d : [];
        setCampaigns(
          (rows as CampaignRow[]).map((c) => ({ id: c.id, name: c.name, dialMode: c.dialMode })),
        );
      })
      .catch(() => setCampaigns([]));
  }, [status, session?.user.role]);

  const loadMetrics = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dialer/metrics?campaignId=${encodeURIComponent(campaignId)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Kunne ikke hente metrics.");
        setMetrics(null);
        return;
      }
      setMetrics(data as MetricsBody);
    } catch {
      setError("Netværksfejl.");
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (campaignId) void loadMetrics();
  }, [campaignId, loadMetrics]);

  if (status === "loading" || !session || session.user.role !== "ADMIN") {
    return <p className="text-stone-500">Henter…</p>;
  }

  const pct = (x: number | null) =>
    x === null || Number.isNaN(x) ? "—" : `${(x * 100).toFixed(2)} %`;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Dialer-metrics</h1>
        <p className="mt-1 text-sm text-stone-600">
          Abandon-rate, pacing-ratio (mål ~3 % for predictive; power dialer bruger fast ratio 1)
          og agentbelastning pr. kampagne. Kræver at agenter sender presence og at server-dispatch kører
          (Power/Predictive).
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[200px] flex-1">
          <span className="text-xs font-medium text-stone-500">Kampagne</span>
          <select
            className="mt-1 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
          >
            <option value="">Vælg kampagne</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.dialMode})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void loadMetrics()}
          disabled={!campaignId || loading}
          className="rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Henter…" : "Opdatér"}
        </button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {metrics && (
        <div className="space-y-4 rounded-lg border border-stone-200 bg-stone-50/80 p-4 text-sm text-stone-800">
          <p>
            <span className="font-medium">{metrics.campaign.name}</span> — mode{" "}
            <code className="rounded bg-stone-200/80 px-1">{metrics.campaign.dialMode}</code>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <h2 className="text-xs font-semibold uppercase text-stone-500">Agenter (frisk heartbeat)</h2>
              <ul className="mt-1 list-inside list-disc">
                <li>Klar: {metrics.agents.ready}</li>
                <li>Agent ringer: {metrics.agents.ringing}</li>
                <li>I samtale: {metrics.agents.talking}</li>
              </ul>
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase text-stone-500">Opkald</h2>
              <ul className="mt-1 list-inside list-disc">
                <li>I luften (lead-legs): {metrics.calls.inFlight}</li>
                <li>Bridges sidste 1h: {metrics.calls.bridges1h}</li>
                <li>Abandons (ingen agent) 1h: {metrics.calls.noAgentAbandons1h}</li>
                <li>AMD maskine/fax 1h: {metrics.calls.amdMachineOrFax1h}</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-stone-200 pt-3">
            <h2 className="text-xs font-semibold uppercase text-stone-500">Pacing (predictive)</h2>
            <ul className="mt-1 list-inside list-disc">
              <li>Aktiv ratio (opkald pr. klar agent, max 3): {metrics.pacing.ratio.toFixed(2)}</li>
              <li>Observeret abandon 1h: {pct(metrics.pacing.abandonRate1h)} (stikprøve: {metrics.pacing.sampleSize1h})</li>
              <li>Mål-abandon: {pct(metrics.window.targetAbandonRate)}</li>
            </ul>
          </div>
        </div>
      )}

      <p className="text-xs text-stone-500">
        Premium-AMD: aktiveres pr. udgående opkald via API (<code>answering_machine_detection: &quot;premium&quot;</code>
        ) — fakturering pr. brugsminut efter Telnyx&apos; prisliste, ikke en separat konto-knap. Sørg for at
        Webhook-URL peger på <code className="rounded bg-stone-100 px-0.5">/api/telnyx/webhooks/call-events</code>.
      </p>
    </div>
  );
}
