"use client";

import { useCallback, useEffect, useState } from "react";

export type CampaignImportLogRow = {
  id: string;
  filename: string;
  totalRows: number;
  newLeadsImported: number;
  existingAttached: number;
  overwriteMatchedCvrs: number;
  protectedCvrsSkipped: number;
  replacedLeadsDeleted: number;
  skippedDuplicateInFile: number;
  skippedAlreadyInCampaign: number;
  skippedInvalid: number;
  attachExistingCvrsToCampaign: boolean;
  importDuplicateCvrs: boolean;
  overwriteExistingCvrs: boolean;
  allowMissingCvr: boolean;
  allowMissingCompanyName: boolean;
  createdAt: string;
  user: { id: string; name: string; username: string };
};

function formatDa(iso: string): string {
  return new Date(iso).toLocaleString("da-DK", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function optionFlags(log: CampaignImportLogRow): string[] {
  const flags: string[] = [];
  if (log.attachExistingCvrsToCampaign) flags.push("Tilknyt CVR");
  if (log.importDuplicateCvrs) flags.push("Medtag dublet-CVR");
  if (log.overwriteExistingCvrs) flags.push("Overskriv CVR");
  if (log.allowMissingCvr) flags.push("Uden CVR OK");
  if (log.allowMissingCompanyName) flags.push("Uden navn OK");
  return flags;
}

export function CampaignImportLogsPanel({
  campaignId,
  refreshKey = 0,
}: {
  campaignId: string;
  /** Øg efter vellykket import for at hente loggen igen. */
  refreshKey?: number;
}) {
  const [logs, setLogs] = useState<CampaignImportLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/import-logs`);
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke hente import-log");
      return;
    }
    const data = (await res.json()) as { logs: CampaignImportLogRow[] };
    setLogs(data.logs);
  }, [campaignId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load, refreshKey]);

  if (!campaignId) return null;

  return (
    <div className="rounded-lg border border-stone-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-stone-800 hover:bg-stone-50"
      >
        <span>Import-historik (filnavn)</span>
        <span className="text-stone-500">{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <div className="border-t border-stone-200 px-4 py-3">
          {loading && <p className="text-sm text-stone-500">Henter…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && logs.length === 0 && (
            <p className="text-sm text-stone-500">Ingen importer logget endnu for denne kampagne.</p>
          )}
          {!loading && logs.length > 0 && (
            <ul className="space-y-3">
              {logs.map((log) => {
                const flags = optionFlags(log);
                return (
                  <li
                    key={log.id}
                    className="rounded-md border border-stone-100 bg-stone-50 px-3 py-2 text-sm text-stone-800"
                  >
                    <div className="font-medium text-stone-900">{log.filename}</div>
                    <div className="mt-1 text-xs text-stone-600">
                      {formatDa(log.createdAt)} · {log.user.name || log.user.username}
                    </div>
                    <div className="mt-1 text-xs text-stone-700">
                      {log.newLeadsImported} nye · {log.existingAttached} tilknyttet · {log.totalRows} rækker i fil
                      {log.skippedAlreadyInCampaign > 0
                        ? ` · ${log.skippedAlreadyInCampaign} sprunget over`
                        : ""}
                    </div>
                    {flags.length > 0 && (
                      <div className="mt-1 text-xs text-stone-500">{flags.join(" · ")}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
