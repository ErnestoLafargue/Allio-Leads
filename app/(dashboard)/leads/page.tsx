"use client";

import Link from "next/link";
import { useState } from "react";
import { LeadsBulkPanel } from "@/app/components/leads-bulk-panel";
import { DashboardTabs } from "@/app/components/dashboard-tabs";

export default function LeadsPage() {
  const [q, setQ] = useState("");

  return (
    <div className="space-y-6">
      <DashboardTabs />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Leads</h1>
          <p className="text-sm text-stone-500">
            Alle leads i systemet. Søg på virksomhed, telefon, adresse m.m. Kolonnen Kampagne viser hvilket
            kampagne leadet tilhører.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Søg…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full min-w-[200px] rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2 sm:w-64"
          />
          <Link
            href="/leads/new"
            className="shrink-0 rounded-md bg-stone-800 px-3 py-2 text-sm font-medium text-white hover:bg-stone-900"
          >
            Nyt lead
          </Link>
        </div>
      </div>

      <LeadsBulkPanel campaignId={null} searchQuery={q} onSearchChange={setQ} showCampaignColumn />
    </div>
  );
}
