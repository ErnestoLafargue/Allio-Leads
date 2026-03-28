"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LeadDataLeftPanel } from "@/app/components/lead-data-left-panel";

type CampaignOption = { id: string; name: string };

export default function NewLeadPage() {
  const router = useRouter();
  const search = useSearchParams();
  const fromUrl = search.get("campaignId")?.trim() ?? "";
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [picked, setPicked] = useState("");
  const campaignId = fromUrl || picked;

  const [fieldConfigJson, setFieldConfigJson] = useState("{}");
  const [campaignName, setCampaignName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cvr, setCvr] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [industry, setIndustry] = useState("");
  const [notes, setNotes] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadCampaigns() {
      setLoadingCampaigns(true);
      const res = await fetch("/api/campaigns");
      if (!res.ok || cancelled) {
        setLoadingCampaigns(false);
        return;
      }
      const data = (await res.json()) as CampaignOption[];
      if (!cancelled) {
        setCampaigns(Array.isArray(data) ? data : []);
        setLoadingCampaigns(false);
      }
    }
    void loadCampaigns();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPicked(fromUrl);
  }, [fromUrl]);

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (!res.ok || cancelled) return;
      const c = await res.json();
      setFieldConfigJson(c.fieldConfig ?? "{}");
      setCampaignName(c.name ?? "");
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  function setCustomKey(key: string, value: string) {
    setCustom((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!campaignId) {
      setError("Vælg en kampagne");
      return;
    }
    setError(null);
    setLoading(true);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId,
        companyName,
        phone,
        email,
        cvr,
        address,
        postalCode,
        city,
        industry,
        notes,
        customFields: custom,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Kunne ikke oprette");
      return;
    }
    const lead = await res.json();
    router.push(`/leads/${lead.id}`);
  }

  if (loadingCampaigns) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-stone-200 bg-white p-6 text-sm text-stone-600">
        Henter kampagner…
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        <p>Der er ingen kampagner endnu.</p>
        <Link href="/import" className="font-medium underline-offset-2 hover:underline">
          Opret kampagne under Import
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link href="/leads" className="text-sm text-stone-500 hover:text-stone-800">
          ← Tilbage til leads
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-stone-900">Nyt lead</h1>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        <label htmlFor="new-lead-campaign" className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Kampagne
        </label>
        <select
          id="new-lead-campaign"
          value={campaignId}
          onChange={(e) => setPicked(e.target.value)}
          disabled={Boolean(fromUrl)}
          className="mt-2 w-full max-w-md rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2 disabled:bg-stone-50 disabled:text-stone-600"
          required
        >
          <option value="">— Vælg kampagne —</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {fromUrl && (
          <p className="mt-2 text-xs text-stone-500">
            Kampagne er låst via link.{" "}
            <Link href="/leads/new" className="font-medium text-stone-700 underline-offset-2 hover:underline">
              Vælg en anden
            </Link>
          </p>
        )}
        {campaignName && <p className="mt-2 text-sm text-stone-500">{campaignName}</p>}
      </div>

      {!campaignId ? (
        <p className="text-sm text-stone-600">Vælg hvilket kampagne leadet skal oprettes under.</p>
      ) : (
        <form onSubmit={onSubmit} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="grid min-h-[min(70vh,36rem)] gap-8 lg:grid-cols-2 lg:gap-0">
            <div className="lg:border-r lg:border-stone-100 lg:pr-8">
              <LeadDataLeftPanel
                fieldConfigJson={fieldConfigJson}
                companyName={companyName}
                onCompanyName={setCompanyName}
                phone={phone}
                onPhone={setPhone}
                email={email}
                onEmail={setEmail}
                cvr={cvr}
                onCvr={setCvr}
                address={address}
                onAddress={setAddress}
                postalCode={postalCode}
                onPostalCode={setPostalCode}
                city={city}
                onCity={setCity}
                industry={industry}
                onIndustry={setIndustry}
                custom={custom}
                onCustom={setCustomKey}
              />
            </div>
            <div className="flex min-h-[14rem] flex-col lg:min-h-0 lg:pl-8">
              <label htmlFor="notes-new" className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Noter
              </label>
              <textarea
                id="notes-new"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2 min-h-[14rem] flex-1 resize-y rounded-lg border border-stone-200 bg-stone-50/50 px-3 py-3 text-sm text-stone-900 shadow-inner outline-none ring-stone-400 focus:ring-2 lg:min-h-[clamp(18rem,62vh,40rem)]"
                placeholder="Skriv noter, aftaler, opfølgning…"
              />
            </div>
          </div>

          {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

          <div className="mt-6 border-t border-stone-100 pt-6">
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-stone-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-60"
            >
              {loading ? "Gemmer…" : "Opret lead"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
