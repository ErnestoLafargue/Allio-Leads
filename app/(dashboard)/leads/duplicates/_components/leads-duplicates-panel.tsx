"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  buildLeadDetailHref,
  leadsDuplicatesOpenedFrom,
} from "@/lib/lead-navigation";
import {
  LEAD_STATUS_COUNT_BADGE_CLASS,
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from "@/lib/lead-status";
import {
  formatBulkDeleteSummaryMessage,
  useBulkDeleteConfirm,
} from "@/app/components/bulk-delete-confirm-dialogs";
import {
  filterDuplicateGroupsByCampaigns,
  type DuplicateGroup,
  type DuplicateGroupsResult,
} from "@/lib/lead-duplicates";

const HIGHLIGHT_STATUSES = new Set<LeadStatus>([
  "NOT_INTERESTED",
  "MEETING_BOOKED",
  "CALLBACK_SCHEDULED",
  "UNQUALIFIED",
]);

function statusLabel(status: string): string {
  const k = status.toUpperCase() as LeadStatus;
  return LEAD_STATUS_LABELS[k] ?? status;
}

function statusBadgeClass(status: string): string {
  const k = status.toUpperCase() as LeadStatus;
  return LEAD_STATUS_COUNT_BADGE_CLASS[k] ?? "border border-stone-300 bg-stone-100 text-stone-800";
}

function formatDa(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("da-DK", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function LeadsDuplicatesPanel() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const openedFrom = leadsDuplicatesOpenedFrom();

  const [data, setData] = useState<DuplicateGroupsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const bulkDelete = useBulkDeleteConfirm({
    onComplete: (summary) => {
      const summaryMsg = formatBulkDeleteSummaryMessage(summary);
      if (summaryMsg) setNotice(summaryMsg);
      setSelected(new Set());
      void load();
    },
    onError: (message) => setError(message),
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/leads/duplicates");
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke hente dubletter");
      setLoading(false);
      return;
    }
    const payload = (await res.json()) as DuplicateGroupsResult;
    setData(payload);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const campaignOptions = useMemo(() => {
    if (!data?.groups.length) return [];
    const byId = new Map<string, string>();
    for (const g of data.groups) {
      for (const l of g.leads) {
        if (l.campaignId && l.campaignName) {
          byId.set(l.campaignId, l.campaignName);
        }
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "da"));
  }, [data]);

  const filteredGroups = useMemo(
    () => filterDuplicateGroupsByCampaigns(data?.groups ?? [], selectedCampaignIds),
    [data, selectedCampaignIds],
  );

  const filterActive = selectedCampaignIds.size > 0;

  const visibleLeadCount = useMemo(
    () => filteredGroups.reduce((n, g) => n + g.leads.length, 0),
    [filteredGroups],
  );

  const visibleLeadIds = useMemo(
    () => filteredGroups.flatMap((g) => g.leads.map((l) => l.id)),
    [filteredGroups],
  );

  const leadById = useMemo(() => {
    const map = new Map<string, { id: string; notes: string }>();
    for (const g of filteredGroups) {
      for (const l of g.leads) {
        map.set(l.id, { id: l.id, notes: l.notes });
      }
    }
    return map;
  }, [filteredGroups]);

  const allSelected =
    visibleLeadIds.length > 0 && visibleLeadIds.every((id) => selected.has(id));

  function toggleCampaignFilter(campaignId: string) {
    setSelectedCampaignIds((prev) => {
      const next = new Set(prev);
      if (next.has(campaignId)) next.delete(campaignId);
      else next.add(campaignId);
      return next;
    });
  }

  function clearCampaignFilter() {
    setSelectedCampaignIds(new Set());
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(group: DuplicateGroup) {
    const ids = group.leads.map((l) => l.id);
    const allIn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allIn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleLeadIds));
    }
  }

  function onDeleteSelected() {
    const ids = [...selected];
    if (!isAdmin || bulkDelete.deleting || ids.length === 0) return;
    setError(null);
    setNotice(null);
    const selectedLeads = ids
      .map((id) => leadById.get(id))
      .filter((l): l is { id: string; notes: string } => l != null);
    bulkDelete.startDelete({ ids, selected: selectedLeads });
  }

  return (
    <div className="space-y-6">
      {bulkDelete.dialog}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/leads" className="text-sm font-medium text-stone-500 hover:text-stone-800">
            ← Tilbage til Leads
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-stone-900">Find dubletter</h1>
          <p className="mt-1 text-sm text-stone-600">
            Leads med samme CVR eller samme telefonnummer (på tværs af kampagner). Vælg selv hvilke
            leads der skal slettes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            disabled={loading || !data?.groups.length}
            className={[
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-60",
              filterActive
                ? "border-stone-800 bg-stone-800 text-white hover:bg-stone-900"
                : "border-stone-200 bg-white text-stone-800 hover:bg-stone-50",
            ].join(" ")}
            aria-expanded={filterOpen}
          >
            Filter
            {filterActive ? (
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-xs font-bold tabular-nums">
                {selectedCampaignIds.size}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50 disabled:opacity-60"
          >
            {loading ? "Henter…" : "Genindlæs"}
          </button>
          {isAdmin && selected.size > 0 && (
            <button
              type="button"
              onClick={() => void onDeleteSelected()}
              disabled={bulkDelete.deleting}
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 shadow-sm hover:bg-red-100 disabled:opacity-60"
            >
              {bulkDelete.deleting ? "Sletter…" : `Slet valgte (${selected.size})`}
            </button>
          )}
        </div>
      </div>

      {filterOpen && data && campaignOptions.length > 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-stone-900">Filtrér på kampagne</p>
            <div className="flex flex-wrap gap-2">
              {filterActive ? (
                <button
                  type="button"
                  onClick={clearCampaignFilter}
                  className="rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
                >
                  Ryd filter
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
              >
                Luk
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Viser dubletgrupper hvor mindst ét lead ligger i en valgt kampagne. Alle leads i gruppen
            vises stadig.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {campaignOptions.map((c) => (
              <label
                key={c.id}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-100 bg-stone-50/80 px-3 py-2 text-sm text-stone-800 hover:bg-stone-100/80"
              >
                <input
                  type="checkbox"
                  checked={selectedCampaignIds.has(c.id)}
                  onChange={() => toggleCampaignFilter(c.id)}
                  className="rounded border-stone-300"
                />
                {c.name}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {data && !loading && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-800">
          <span>
            <strong>{filteredGroups.length}</strong> dubletgruppe
            {filteredGroups.length === 1 ? "" : "r"}
            {filterActive && data.groupCount !== filteredGroups.length ? (
              <span className="font-normal text-stone-500"> (af {data.groupCount})</span>
            ) : null}
          </span>
          <span className="text-stone-400">·</span>
          <span>
            <strong>{visibleLeadCount}</strong> leads i dubletter
            {filterActive && data.duplicateLeadCount !== visibleLeadCount ? (
              <span className="font-normal text-stone-500"> (af {data.duplicateLeadCount})</span>
            ) : null}
          </span>
          {visibleLeadIds.length > 0 && (
            <>
              <span className="text-stone-400">·</span>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-stone-300"
                />
                Vælg alle
              </label>
            </>
          )}
        </div>
      )}

      {notice && <p className="text-sm text-emerald-800">{notice}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading && !data && (
        <p className="py-12 text-center text-sm text-stone-500">Søger efter dubletter…</p>
      )}

      {!loading && data && data.groups.length === 0 && (
        <p className="rounded-lg border border-stone-200 bg-white px-4 py-12 text-center text-sm text-stone-500 shadow-sm">
          Ingen dubletter fundet.
        </p>
      )}

      {!loading && data && data.groups.length > 0 && filteredGroups.length === 0 && (
        <p className="rounded-lg border border-stone-200 bg-white px-4 py-12 text-center text-sm text-stone-500 shadow-sm">
          Ingen dubletgrupper matcher de valgte kampagner.
        </p>
      )}

      {filteredGroups.map((group, groupIndex) => (
        <section
          key={group.id}
          className="overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 bg-stone-50/90 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-stone-900">
                Dubletgruppe #{groupIndex + 1}
              </h2>
              <p className="mt-0.5 text-xs text-stone-600">{group.matchLabel}</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-stone-600">
              <input
                type="checkbox"
                checked={group.leads.every((l) => selected.has(l.id))}
                onChange={() => toggleGroup(group)}
                className="rounded border-stone-300"
              />
              Vælg gruppe
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-stone-100 bg-white text-xs text-stone-500">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2 font-medium">Virksomhed</th>
                  <th className="px-3 py-2 font-medium">Domæne</th>
                  <th className="px-3 py-2 font-medium">CVR</th>
                  <th className="px-3 py-2 font-medium">Telefon</th>
                  <th className="px-3 py-2 font-medium">Kampagne</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Sidst udfald</th>
                  <th className="px-3 py-2 font-medium">Tilføjet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {group.leads.map((lead) => {
                  const highlight = HIGHLIGHT_STATUSES.has(lead.status.toUpperCase() as LeadStatus);
                  return (
                    <tr
                      key={lead.id}
                      className={highlight ? "bg-amber-50/40" : "hover:bg-stone-50/80"}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(lead.id)}
                          onChange={() => toggleOne(lead.id)}
                          className="rounded border-stone-300"
                          aria-label={`Vælg ${lead.companyName}`}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={buildLeadDetailHref(lead.id, openedFrom)}
                          className="font-medium text-stone-900 underline-offset-2 hover:underline"
                        >
                          {lead.companyName}
                        </Link>
                      </td>
                      <td className="max-w-[12rem] truncate px-3 py-2.5 text-stone-700" title={lead.domain || undefined}>
                        {lead.domain || "—"}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-stone-700">{lead.cvr || "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums text-stone-700">{lead.phone || "—"}</td>
                      <td className="px-3 py-2.5 text-stone-700">{lead.campaignName ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(lead.status)}`}
                        >
                          {statusLabel(lead.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-stone-600">{formatDa(lead.lastOutcomeAt)}</td>
                      <td className="px-3 py-2.5 text-stone-600">{formatDa(lead.importedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
