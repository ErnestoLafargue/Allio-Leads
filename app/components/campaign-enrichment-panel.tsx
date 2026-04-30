"use client";

import { useMemo, useState } from "react";
import { FIELD_GROUPS, FIELD_GROUP_LABELS, parseFieldConfig } from "@/lib/campaign-fields";
import { STANDARD_MAPPING_OPTIONS } from "@/lib/import-mapping";
import type { EnrichmentFieldBreakdown, EnrichmentMatchField, EnrichmentStats } from "@/lib/campaign-enrichment";

type PreviewResponse = {
  columns: string[];
  previewRows: Record<string, string>[];
  suggestedMapping: Record<string, string>;
  stats: EnrichmentStats;
  warnings: string[];
  fieldBreakdown?: EnrichmentFieldBreakdown[];
};

type ApplyResponse = {
  ok: boolean;
  stats: EnrichmentStats;
  warnings: string[];
};
type EnrichmentProgressEvent =
  | { type: "progress"; processedLeads: number; totalLeads: number; percent: number }
  | { type: "result"; result: ApplyResponse }
  | { type: "error"; error?: string; details?: string };

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
  const deduped = new Map<string, { id: string; label: string }>();
  for (const option of options) {
    if (!deduped.has(option.id)) deduped.set(option.id, option);
  }
  return Array.from(deduped.values());
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
  const [limitToSelectedFields, setLimitToSelectedFields] = useState(false);
  const [targetFields, setTargetFields] = useState<string[]>([]);
  const [preview, setPreview] = useState<EnrichmentStats | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fieldBreakdown, setFieldBreakdown] = useState<EnrichmentFieldBreakdown[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [enrichmentProgressPercent, setEnrichmentProgressPercent] = useState(0);
  const [enrichmentProgressProcessedLeads, setEnrichmentProgressProcessedLeads] = useState(0);
  const [enrichmentProgressTotalLeads, setEnrichmentProgressTotalLeads] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ApplyResponse | null>(null);

  const mappingOptions = useMemo(() => buildMappingOptions(fieldConfigJson), [fieldConfigJson]);
  const mappedTargets = new Set(Object.values(mapping));
  const missingTargetFields = targetFields.filter((field) => !mappedTargets.has(field));
  const hasInvalidTargetSelection = limitToSelectedFields && (targetFields.length === 0 || missingTargetFields.length > 0);

  function resetFlow() {
    setFile(null);
    setMapping({});
    setColumns([]);
    setPreviewRows([]);
    setPreview(null);
    setWarnings([]);
    setFieldBreakdown([]);
    setError(null);
    setDone(null);
    setMatchField("cvr");
    setOverwriteExisting(false);
    setLimitToSelectedFields(false);
    setTargetFields([]);
  }

  async function runPreview(useCurrentMapping: boolean) {
    if (!file) return;
    setError(null);
    setDone(null);
    setFieldBreakdown([]);
    setLoadingPreview(true);
    const fd = new FormData();
    fd.append("file", file);
    if (useCurrentMapping) fd.append("mapping", JSON.stringify(mapping));
    fd.append("matchField", matchField);
    fd.append("overwriteExisting", overwriteExisting ? "1" : "0");
    if (limitToSelectedFields) fd.append("targetFields", JSON.stringify(targetFields));
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
    setFieldBreakdown(Array.isArray(data.fieldBreakdown) ? data.fieldBreakdown : []);
    if (!useCurrentMapping) setMapping(data.suggestedMapping ?? {});
  }

  async function applyEnrichment() {
    if (!file || !preview) return;
    setError(null);
    setApplying(true);
    setEnrichmentProgressPercent(0);
    setEnrichmentProgressProcessedLeads(0);
    setEnrichmentProgressTotalLeads(0);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(mapping));
    fd.append("matchField", matchField);
    fd.append("overwriteExisting", overwriteExisting ? "1" : "0");
    if (limitToSelectedFields) fd.append("targetFields", JSON.stringify(targetFields));
    const res = await fetch(`/api/campaigns/${campaignId}/enrich/apply`, { method: "POST", body: fd });
    if (!res.ok) {
      setApplying(false);
      const payload = await res.json().catch(() => ({}));
      setError([payload.error, payload.details].filter(Boolean).join(": ") || "Berigelse fejlede.");
      return;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/x-ndjson") || !res.body) {
      setApplying(false);
      const payload = await res.json().catch(() => ({}));
      const data = payload as ApplyResponse;
      setDone(data);
      setPreview(data.stats);
      setWarnings(data.warnings ?? []);
      setFieldBreakdown([]);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let gotResult = false;
    while (true) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let evt: EnrichmentProgressEvent;
        try {
          evt = JSON.parse(trimmed) as EnrichmentProgressEvent;
        } catch {
          continue;
        }
        if (evt.type === "progress") {
          setEnrichmentProgressPercent(Math.max(0, Math.min(100, evt.percent)));
          setEnrichmentProgressProcessedLeads(evt.processedLeads);
          setEnrichmentProgressTotalLeads(evt.totalLeads);
        } else if (evt.type === "result") {
          const data = evt.result;
          setDone(data);
          setPreview(data.stats);
          setWarnings(data.warnings ?? []);
          setFieldBreakdown([]);
          gotResult = true;
        } else if (evt.type === "error") {
          setError([evt.error, evt.details].filter(Boolean).join(": ") || "Berigelse fejlede.");
          setApplying(false);
          return;
        }
      }
    }
    setApplying(false);
    if (!gotResult) {
      setError("Berigelse blev afbrudt før resultat.");
    }
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
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !loadingPreview && !applying && setOpen(false)}
        >
          <div
            className="my-4 max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto rounded-xl border border-stone-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
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
                      setFieldBreakdown([]);
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
                <label className="flex items-start gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800">
                  <input
                    type="checkbox"
                    checked={limitToSelectedFields}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setLimitToSelectedFields(enabled);
                      if (!enabled) setTargetFields([]);
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-stone-300"
                  />
                  <span>
                    Berig kun valgte felter
                    <span className="mt-0.5 block text-xs text-stone-500">
                      Matcher stadig på valgt nøgle (fx CVR), men opdaterer kun de felter du vælger.
                    </span>
                  </span>
                </label>
                {limitToSelectedFields ? (
                  <label className="block text-sm font-medium text-stone-700">
                    Felter der må beriges
                    <select
                      multiple
                      value={targetFields}
                      onChange={(e) =>
                        setTargetFields(Array.from(e.currentTarget.selectedOptions).map((option) => option.value))
                      }
                      className="mt-1 min-h-36 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
                    >
                      {mappingOptions
                        .filter((option) => option.id !== "skip")
                        .map((option) => (
                          <option key={`target-${option.id}`} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                    </select>
                    <span className="mt-1 block text-xs text-stone-500">
                      Hold Ctrl/Cmd nede for at vælge flere (fx hjemmeside + virksomhedsnavn). Listen kan scrolles.
                    </span>
                  </label>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void runPreview(false)}
                    disabled={
                      !file ||
                      loadingPreview ||
                      hasInvalidTargetSelection
                    }
                    className="rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
                  >
                    {loadingPreview ? "Analyserer…" : "Analyser fil"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runPreview(true)}
                    disabled={
                      !file ||
                      columns.length === 0 ||
                      loadingPreview ||
                      hasInvalidTargetSelection
                    }
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
                {limitToSelectedFields && fieldBreakdown.length > 0 ? (
                  <div className="rounded-md border border-stone-200 bg-white p-3 text-xs text-stone-700">
                    <p className="font-semibold text-stone-900">Status pr. valgt felt (matchende leads)</p>
                    <ul className="mt-2 space-y-2">
                      {fieldBreakdown.map((row) => {
                        const label =
                          mappingOptions.find((opt) => opt.id === row.field)?.label ?? row.field;
                        return (
                          <li key={`field-breakdown-${row.field}`} className="rounded border border-stone-100 bg-stone-50 px-2 py-1.5">
                            <p className="font-medium text-stone-900">{label}</p>
                            <p>
                              Udfyldt: {row.alreadyFilled} • Tomt: {row.empty} • Med værdi i upload: {row.withIncomingValue}
                              {" "}• Bliver opdateret: {row.plannedUpdates}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-2 text-[11px] text-stone-500">
                      Ved virksomhedsnavn tælles &quot;(Uden virksomhedsnavn)&quot; som tomt.
                    </p>
                  </div>
                ) : null}

                {warnings.length > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {warnings.map((w, i) => (
                      <p key={`${w}-${i}`}>{w}</p>
                    ))}
                  </div>
                ) : null}
                {limitToSelectedFields && targetFields.length === 0 ? (
                  <p className="text-xs text-amber-700">
                    Vælg mindst ét felt at berige.
                  </p>
                ) : null}
                {limitToSelectedFields && missingTargetFields.length > 0 ? (
                  <p className="text-xs text-amber-700">
                    Ét eller flere valgte felter er ikke mappet endnu. Map mindst én kolonne til hvert valgt felt i tabellen.
                  </p>
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
                    disabled={
                      !preview ||
                      preview.leadsToUpdate === 0 ||
                      applying ||
                      hasInvalidTargetSelection
                    }
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {applying ? "Beriger…" : "Gennemfør berigelse"}
                  </button>
                </div>
                {applying ? (
                  <div className="w-full rounded-md border border-stone-200 bg-stone-50 p-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-stone-700">
                      <span>
                        {enrichmentProgressTotalLeads > 0
                          ? `Behandler ${enrichmentProgressProcessedLeads} ud af ${enrichmentProgressTotalLeads} leads`
                          : "Starter berigelse…"}
                      </span>
                      <span className="font-semibold tabular-nums">{enrichmentProgressPercent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                      <div
                        className="h-full rounded-full bg-emerald-600 transition-[width] duration-200"
                        style={{ width: `${enrichmentProgressPercent}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
