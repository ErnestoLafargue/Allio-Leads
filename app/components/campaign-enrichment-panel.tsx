"use client";

import { useMemo, useState } from "react";
import { FIELD_GROUPS, FIELD_GROUP_LABELS, parseFieldConfig } from "@/lib/campaign-fields";
import { STANDARD_MAPPING_OPTIONS } from "@/lib/import-mapping";
import type { EnrichmentMatchField, EnrichmentStats } from "@/lib/campaign-enrichment";

type PreviewResponse = {
  columns: string[];
  previewRows: Record<string, string>[];
  suggestedMapping: Record<string, string>;
  stats: EnrichmentStats;
  warnings: string[];
};

type ApplyResponse = {
  ok: boolean;
  stats: EnrichmentStats;
  warnings: string[];
};

function buildMappingOptions(fieldConfigJson: string) {
  const cfg = parseFieldConfig(fieldConfigJson);
  const options: { id: string; label: string }[] = [...STANDARD_MAPPING_OPTIONS];
  for (const g of FIELD_GROUPS) {
    for (const f of cfg.extensions[g] ?? []) {
      options.push({
        id: `custom:${f.key}`,
        label: `${f.label} (${FIELD_GROUP_LABELS[g]})`,
      });
    }
  }
  options.push({ id: "custom:domain", label: "Domæne (ekstra felt)" });
  options.push({ id: "custom:website", label: "Hjemmeside (ekstra felt)" });
  return options;
}

const MATCH_FIELD_OPTIONS: { id: EnrichmentMatchField; label: string }[] = [
  { id: "cvr", label: "CVR" },
  { id: "companyName", label: "Virksomhedsnavn" },
  { id: "phone", label: "Telefonnummer" },
  { id: "email", label: "E-mail" },
  { id: "domain", label: "Domæne / hjemmeside" },
];

export function CampaignEnrichmentPanel({
  campaignId,
  fieldConfigJson,
}: {
  campaignId: string;
  fieldConfigJson: string;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [columns, setColumns] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [matchField, setMatchField] = useState<EnrichmentMatchField>("cvr");
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [preview, setPreview] = useState<EnrichmentStats | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ApplyResponse | null>(null);

  const mappingOptions = useMemo(() => buildMappingOptions(fieldConfigJson), [fieldConfigJson]);

  function resetFlow() {
    setFile(null);
    setMapping({});
    setColumns([]);
    setPreviewRows([]);
    setPreview(null);
    setWarnings([]);
    setError(null);
    setDone(null);
    setMatchField("cvr");
    setOverwriteExisting(false);
  }

  async function runPreview(useCurrentMapping: boolean) {
    if (!file) return;
    setError(null);
    setDone(null);
    setLoadingPreview(true);
    const fd = new FormData();
    fd.append("file", file);
    if (useCurrentMapping) fd.append("mapping", JSON.stringify(mapping));
    fd.append("matchField", matchField);
    fd.append("overwriteExisting", overwriteExisting ? "1" : "0");
    const res = await fetch(`/api/campaigns/${campaignId}/enrich/preview`, { method: "POST", body: fd });
    setLoadingPreview(false);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError([payload.error, payload.details].filter(Boolean).join(": ") || "Kunne ikke lave preview.");
      return;
    }
    const data = payload as PreviewResponse;
    setColumns(data.columns);
    setPreviewRows(data.previewRows);
    setPreview(data.stats);
    setWarnings(data.warnings ?? []);
    if (!useCurrentMapping) setMapping(data.suggestedMapping ?? {});
  }

  async function applyEnrichment() {
    if (!file || !preview) return;
    setError(null);
    setApplying(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(mapping));
    fd.append("matchField", matchField);
    fd.append("overwriteExisting", overwriteExisting ? "1" : "0");
    const res = await fetch(`/api/campaigns/${campaignId}/enrich/apply`, { method: "POST", body: fd });
    setApplying(false);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError([payload.error, payload.details].filter(Boolean).join(": ") || "Berigelse fejlede.");
      return;
    }
    const data = payload as ApplyResponse;
    setDone(data);
    setPreview(data.stats);
    setWarnings(data.warnings ?? []);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetFlow();
          setOpen(true);
        }}
        className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-800 hover:bg-stone-100"
      >
        Berig kampagne
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !loadingPreview && !applying && setOpen(false)}
        >
          <div className="w-full max-w-5xl rounded-xl border border-stone-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">Berig kampagne</h3>
                <p className="mt-1 text-sm text-stone-600">
                  Upload et nyt ark, match på nøgle, gennemgå preview og berig eksisterende leads.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
              >
                Luk
              </button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
              <section className="space-y-3 rounded-lg border border-stone-200 bg-stone-50/60 p-3">
                <label className="block text-sm font-medium text-stone-700">
                  Fil (.csv, .xlsx, .xls)
                  <input
                    type="file"
                    accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] ?? null);
                      setPreview(null);
                      setDone(null);
                      setColumns([]);
                      setPreviewRows([]);
                      setMapping({});
                    }}
                    className="mt-1 block w-full text-sm text-stone-600 file:mr-4 file:rounded-md file:border-0 file:bg-stone-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-stone-800"
                  />
                </label>

                <label className="block text-sm font-medium text-stone-700">
                  Match-nøgle
                  <select
                    value={matchField}
                    onChange={(e) => setMatchField(e.target.value as EnrichmentMatchField)}
                    className="mt-1 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
                  >
                    {MATCH_FIELD_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-start gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800">
                  <input
                    type="checkbox"
                    checked={overwriteExisting}
                    onChange={(e) => setOverwriteExisting(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-stone-300"
                  />
                  <span>
                    Overskriv eksisterende værdier
                    <span className="mt-0.5 block text-xs text-stone-500">
                      Når slået fra udfyldes kun tomme felter. Tomme værdier fra filen overskriver aldrig.
                    </span>
                  </span>
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void runPreview(false)}
                    disabled={!file || loadingPreview}
                    className="rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
                  >
                    {loadingPreview ? "Analyserer…" : "Analyser fil"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runPreview(true)}
                    disabled={!file || columns.length === 0 || loadingPreview}
                    className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                  >
                    Opdater preview
                  </button>
                </div>

                {preview ? (
                  <div className="rounded-md border border-stone-200 bg-white p-3 text-xs text-stone-700">
                    <p className="font-semibold text-stone-900">Preview</p>
                    <ul className="mt-2 space-y-1">
                      <li>Rækker i fil: {preview.totalRows}</li>
                      <li>Matches fundet: {preview.matchedUploadGroups}</li>
                      <li>Leads der opdateres: {preview.leadsToUpdate}</li>
                      <li>Nye felter tilføjes: {preview.fieldsAdded}</li>
                      <li>Felter overskrevet: {preview.fieldsOverwritten}</li>
                      <li>Felter uændret: {preview.fieldsUnchanged}</li>
                      <li>Rækker uden match: {preview.unmatchedUploadGroups + preview.rowsWithoutMatchKey}</li>
                    </ul>
                  </div>
                ) : null}

                {warnings.length > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {warnings.map((w, i) => (
                      <p key={`${w}-${i}`}>{w}</p>
                    ))}
                  </div>
                ) : null}

                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                {done?.ok ? <p className="text-sm text-emerald-700">Berigelse gennemført.</p> : null}
              </section>

              <section className="space-y-3 rounded-lg border border-stone-200 bg-white p-3">
                <p className="text-sm font-semibold text-stone-900">Kolonne-mapping</p>
                {columns.length === 0 ? (
                  <p className="text-sm text-stone-500">Analyser en fil for at se mapping.</p>
                ) : (
                  <div className="max-h-[45vh] overflow-auto rounded-md border border-stone-200">
                    <table className="w-full min-w-[34rem] text-left text-sm">
                      <thead className="sticky top-0 bg-stone-50 text-stone-600">
                        <tr>
                          <th className="px-3 py-2 font-medium">Kolonne</th>
                          <th className="px-3 py-2 font-medium">Map til</th>
                          <th className="px-3 py-2 font-medium">Eksempel</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {columns.map((col) => {
                          const example = previewRows.map((r) => r[col]).find((v) => String(v ?? "").trim()) ?? "—";
                          return (
                            <tr key={col}>
                              <td className="px-3 py-2 font-mono text-xs text-stone-800">{col}</td>
                              <td className="px-3 py-2">
                                <select
                                  value={mapping[col] ?? "skip"}
                                  onChange={(e) => setMapping((prev) => ({ ...prev, [col]: e.target.value }))}
                                  className="w-full rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-900"
                                >
                                  {mappingOptions.map((option) => (
                                    <option key={`${col}-${option.id}`} value={option.id}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="max-w-xs truncate px-3 py-2 text-xs text-stone-600" title={String(example)}>
                                {String(example)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void applyEnrichment()}
                    disabled={!preview || preview.leadsToUpdate === 0 || applying}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {applying ? "Beriger…" : "Gennemfør berigelse"}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
