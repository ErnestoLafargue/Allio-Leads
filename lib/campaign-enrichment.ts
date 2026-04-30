import { parseCustomFields, stringifyCustomFields } from "@/lib/custom-fields";
import { applyColumnMapping, collectCustomFromRow, pickBaseFromNorm, type MappingRecord } from "@/lib/import-mapping";
import { normalizeCVR } from "@/lib/cvr-import";
import { parseFieldConfig } from "@/lib/campaign-fields";

export type EnrichmentMatchField = "cvr" | "companyName" | "phone" | "email" | "domain";

export type LeadEnrichmentSource = {
  id: string;
  companyName: string;
  phone: string;
  email: string;
  cvr: string;
  address: string;
  postalCode: string;
  city: string;
  industry: string;
  notes: string;
  customFields: string;
};

type UploadAggregate = {
  matchValue: string;
  sourceRows: number;
  base: {
    companyName: string;
    phone: string;
    email: string;
    cvr: string;
    address: string;
    postalCode: string;
    city: string;
    industry: string;
    domain: string;
  };
  custom: Record<string, string>;
};

export type EnrichmentStats = {
  totalRows: number;
  rowsWithMatchKey: number;
  rowsWithoutMatchKey: number;
  duplicateUploadRows: number;
  matchedUploadGroups: number;
  unmatchedUploadGroups: number;
  leadsToUpdate: number;
  fieldsAdded: number;
  fieldsOverwritten: number;
  fieldsUnchanged: number;
};

export type EnrichmentPreviewResult = {
  stats: EnrichmentStats;
  warnings: string[];
  uploadGroups: number;
};
export type EnrichmentFieldBreakdown = {
  field: string;
  matchedLeads: number;
  alreadyFilled: number;
  empty: number;
  withIncomingValue: number;
  plannedUpdates: number;
};

export type PreparedEnrichment = {
  aggregates: UploadAggregate[];
  statsBase: Pick<EnrichmentStats, "totalRows" | "rowsWithMatchKey" | "rowsWithoutMatchKey" | "duplicateUploadRows">;
  warnings: string[];
};

const EMPTY_COMPANY_PLACEHOLDER = "(uden virksomhedsnavn)";
const DOMAIN_CUSTOM_KEYS = ["domain", "hjemmeside", "website", "url", "webside"];

function normalizeText(v: string): string {
  return v.trim().toLowerCase();
}

function normalizePhone(v: string): string {
  return v.replace(/[^\d+]/g, "").trim().toLowerCase();
}

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

function normalizeDomain(value: string): string {
  let v = value.trim().toLowerCase();
  if (!v) return "";
  v = v.replace(/^https?:\/\//, "");
  v = v.replace(/^www\./, "");
  const slash = v.indexOf("/");
  if (slash >= 0) v = v.slice(0, slash);
  return v.trim();
}

function isIncomingValueEmpty(v: string): boolean {
  return !v.trim();
}

function isExistingValueEmpty(v: string): boolean {
  const t = v.trim();
  if (!t) return true;
  const normalized = t
    .toLocaleLowerCase("da")
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized === EMPTY_COMPANY_PLACEHOLDER.replace(/[()]/g, "")) return true;
  if (normalized.includes("uden virksomhedsnavn")) return true;
  return false;
}

function getLeadMatchValue(lead: LeadEnrichmentSource, matchField: EnrichmentMatchField): string {
  if (matchField === "cvr") return normalizeCVR(lead.cvr) ?? "";
  if (matchField === "companyName") return normalizeText(lead.companyName);
  if (matchField === "phone") return normalizePhone(lead.phone);
  if (matchField === "email") return normalizeEmail(lead.email);
  const custom = parseCustomFields(lead.customFields);
  for (const key of DOMAIN_CUSTOM_KEYS) {
    const val = custom[key];
    if (!isIncomingValueEmpty(val ?? "")) return normalizeDomain(val);
  }
  return "";
}

function getUploadMatchValue(agg: UploadAggregate, matchField: EnrichmentMatchField): string {
  if (matchField === "cvr") return normalizeCVR(agg.base.cvr) ?? "";
  if (matchField === "companyName") return normalizeText(agg.base.companyName);
  if (matchField === "phone") return normalizePhone(agg.base.phone);
  if (matchField === "email") return normalizeEmail(agg.base.email);
  const direct = normalizeDomain(agg.base.domain);
  if (direct) return direct;
  for (const key of DOMAIN_CUSTOM_KEYS) {
    const val = agg.custom[key];
    if (!isIncomingValueEmpty(val ?? "")) return normalizeDomain(val);
  }
  return "";
}

function mergeFirstNonEmpty(target: Record<string, string>, source: Record<string, string>) {
  for (const [key, raw] of Object.entries(source)) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    if (!target[key]) target[key] = value;
  }
}

function isMappingTargetForMatchField(target: string, matchField: EnrichmentMatchField): boolean {
  if (matchField === "domain") {
    return target === "domain" || target === "custom:domain" || target === "custom:website";
  }
  return target === matchField;
}

export function restrictMappingForTargetFields(
  mapping: MappingRecord,
  targetFields: string[],
  matchField: EnrichmentMatchField,
): MappingRecord {
  const allowedTargets = new Set(targetFields.map((f) => f.trim()).filter(Boolean));
  const out: MappingRecord = {};
  for (const [column, target] of Object.entries(mapping)) {
    if (!target) continue;
    if (allowedTargets.has(target) || isMappingTargetForMatchField(target, matchField)) {
      out[column] = target;
    }
  }
  return out;
}

export function prepareEnrichmentUpload(params: {
  rows: Record<string, string>[];
  mapping: MappingRecord;
  fieldConfigJson: string;
  matchField: EnrichmentMatchField;
}): PreparedEnrichment {
  const { rows, mapping, fieldConfigJson, matchField } = params;
  const cfg = parseFieldConfig(fieldConfigJson);
  const groups = new Map<string, UploadAggregate>();
  let rowsWithoutMatchKey = 0;
  let rowsWithMatchKey = 0;
  let duplicateUploadRows = 0;

  for (const row of rows) {
    const normalized = applyColumnMapping(row, mapping);
    const base = pickBaseFromNorm(normalized);
    const extra = collectCustomFromRow(normalized, cfg);
    const mappedCustom: Record<string, string> = {};
    for (const [col, target] of Object.entries(mapping)) {
      if (!target?.startsWith("custom:")) continue;
      const key = target.slice(7).trim();
      if (!key) continue;
      const value = String(row[col] ?? "").trim();
      if (value) mappedCustom[key] = value;
    }
    const custom = { ...mappedCustom, ...extra };
    const aggregateCandidate: UploadAggregate = {
      matchValue: "",
      sourceRows: 1,
      base: {
        companyName: base.companyName,
        phone: base.phone,
        email: base.email,
        cvr: base.cvr,
        address: base.address,
        postalCode: base.postalCode,
        city: base.city,
        industry: base.industry,
        domain: normalized.domain?.trim() ?? "",
      },
      custom,
    };
    const key = getUploadMatchValue(aggregateCandidate, matchField);
    if (!key) {
      rowsWithoutMatchKey += 1;
      continue;
    }
    rowsWithMatchKey += 1;
    const existing = groups.get(key);
    if (!existing) {
      aggregateCandidate.matchValue = key;
      groups.set(key, aggregateCandidate);
      continue;
    }
    existing.sourceRows += 1;
    duplicateUploadRows += 1;
    mergeFirstNonEmpty(existing.base as unknown as Record<string, string>, aggregateCandidate.base as unknown as Record<string, string>);
    mergeFirstNonEmpty(existing.custom, aggregateCandidate.custom);
  }

  const warnings: string[] = [];
  if (duplicateUploadRows > 0) {
    warnings.push(
      `${duplicateUploadRows} upload-rækker delte samme matchnøgle. Første ikke-tomme værdi pr. felt bruges.`,
    );
  }
  if (rowsWithoutMatchKey > 0) {
    warnings.push(`${rowsWithoutMatchKey} rækker blev ignoreret fordi match-værdien manglede.`);
  }

  return {
    aggregates: Array.from(groups.values()),
    statsBase: {
      totalRows: rows.length,
      rowsWithMatchKey,
      rowsWithoutMatchKey,
      duplicateUploadRows,
    },
    warnings,
  };
}

type LeadPatchPlan = {
  leadId: string;
  data: {
    companyName?: string;
    phone?: string;
    email?: string;
    cvr?: string;
    address?: string;
    postalCode?: string;
    city?: string;
    industry?: string;
    customFields?: string;
  };
};

function incomingValueForField(agg: UploadAggregate, field: string): string {
  if (field.startsWith("custom:")) {
    return String(agg.custom[field.slice("custom:".length)] ?? "").trim();
  }
  if (field === "domain") return agg.base.domain.trim();
  return String((agg.base as Record<string, string>)[field] ?? "").trim();
}

function existingValueForField(lead: LeadEnrichmentSource, leadCustom: Record<string, string>, field: string): string {
  if (field.startsWith("custom:")) {
    return String(leadCustom[field.slice("custom:".length)] ?? "");
  }
  if (field === "domain") return String(leadCustom.domain ?? "");
  return String((lead as Record<string, string>)[field] ?? "");
}

export function buildEnrichmentPreview(params: {
  prepared: PreparedEnrichment;
  leads: LeadEnrichmentSource[];
  matchField: EnrichmentMatchField;
  overwriteExisting: boolean;
  focusFields?: string[];
}): EnrichmentPreviewResult & { plans: LeadPatchPlan[]; fieldBreakdown: EnrichmentFieldBreakdown[] } {
  const { prepared, leads, matchField, overwriteExisting, focusFields = [] } = params;
  const leadIndex = new Map<string, LeadEnrichmentSource[]>();
  for (const lead of leads) {
    const key = getLeadMatchValue(lead, matchField);
    if (!key) continue;
    const list = leadIndex.get(key) ?? [];
    list.push(lead);
    leadIndex.set(key, list);
  }

  const plans: LeadPatchPlan[] = [];
  let matchedUploadGroups = 0;
  let unmatchedUploadGroups = 0;
  let leadsToUpdate = 0;
  let fieldsAdded = 0;
  let fieldsOverwritten = 0;
  let fieldsUnchanged = 0;
  const breakdownMap = new Map<string, EnrichmentFieldBreakdown>();
  for (const field of focusFields) {
    breakdownMap.set(field, {
      field,
      matchedLeads: 0,
      alreadyFilled: 0,
      empty: 0,
      withIncomingValue: 0,
      plannedUpdates: 0,
    });
  }

  for (const agg of prepared.aggregates) {
    const matchedLeads = leadIndex.get(agg.matchValue) ?? [];
    if (matchedLeads.length === 0) {
      unmatchedUploadGroups += 1;
      continue;
    }
    matchedUploadGroups += 1;

    for (const lead of matchedLeads) {
      const leadCustom = parseCustomFields(lead.customFields);
      const nextCustom = { ...leadCustom };
      const patch: LeadPatchPlan["data"] = {};
      for (const field of focusFields) {
        const item = breakdownMap.get(field);
        if (!item) continue;
        const existingValue = existingValueForField(lead, leadCustom, field);
        const incomingValue = incomingValueForField(agg, field);
        const existingEmpty = isExistingValueEmpty(existingValue);
        const hasIncoming = !isIncomingValueEmpty(incomingValue);
        item.matchedLeads += 1;
        if (existingEmpty) item.empty += 1;
        else item.alreadyFilled += 1;
        if (hasIncoming) item.withIncomingValue += 1;
        const shouldUpdate =
          hasIncoming &&
          (overwriteExisting || existingEmpty) &&
          incomingValue !== existingValue.trim();
        if (shouldUpdate) item.plannedUpdates += 1;
      }

      const applyStandard = (field: keyof UploadAggregate["base"], existingValue: string) => {
        if (field === "domain") return;
        const incoming = agg.base[field].trim();
        if (isIncomingValueEmpty(incoming)) return;
        if (!overwriteExisting && !isExistingValueEmpty(existingValue)) {
          fieldsUnchanged += 1;
          return;
        }
        if (incoming === existingValue.trim()) {
          fieldsUnchanged += 1;
          return;
        }
        (patch as Record<string, string>)[field] = incoming;
        if (isExistingValueEmpty(existingValue)) fieldsAdded += 1;
        else fieldsOverwritten += 1;
      };

      applyStandard("companyName", lead.companyName);
      applyStandard("phone", lead.phone);
      applyStandard("email", lead.email);
      applyStandard("cvr", lead.cvr);
      applyStandard("address", lead.address);
      applyStandard("postalCode", lead.postalCode);
      applyStandard("city", lead.city);
      applyStandard("industry", lead.industry);

      for (const [customKey, raw] of Object.entries(agg.custom)) {
        const incoming = raw.trim();
        if (isIncomingValueEmpty(incoming)) continue;
        const existing = String(leadCustom[customKey] ?? "");
        if (!overwriteExisting && !isExistingValueEmpty(existing)) {
          fieldsUnchanged += 1;
          continue;
        }
        if (incoming === existing.trim()) {
          fieldsUnchanged += 1;
          continue;
        }
        nextCustom[customKey] = incoming;
        if (isExistingValueEmpty(existing)) fieldsAdded += 1;
        else fieldsOverwritten += 1;
      }

      // Domæne kan være map'et som standardfelt; gemmes som custom-felt.
      const domainValue = agg.base.domain.trim();
      if (!isIncomingValueEmpty(domainValue)) {
        const existingDomain = String(leadCustom.domain ?? "");
        if (!overwriteExisting && !isExistingValueEmpty(existingDomain)) {
          fieldsUnchanged += 1;
        } else if (domainValue === existingDomain.trim()) {
          fieldsUnchanged += 1;
        } else {
          nextCustom.domain = domainValue;
          if (isExistingValueEmpty(existingDomain)) fieldsAdded += 1;
          else fieldsOverwritten += 1;
        }
      }

      // Noter må aldrig ændres via berigelse.
      if (JSON.stringify(nextCustom) !== JSON.stringify(leadCustom)) {
        patch.customFields = stringifyCustomFields(nextCustom);
      }

      if (Object.keys(patch).length > 0) {
        plans.push({ leadId: lead.id, data: patch });
        leadsToUpdate += 1;
      }
    }
  }

  return {
    plans,
    uploadGroups: prepared.aggregates.length,
    fieldBreakdown: Array.from(breakdownMap.values()),
    warnings: prepared.warnings,
    stats: {
      totalRows: prepared.statsBase.totalRows,
      rowsWithMatchKey: prepared.statsBase.rowsWithMatchKey,
      rowsWithoutMatchKey: prepared.statsBase.rowsWithoutMatchKey,
      duplicateUploadRows: prepared.statsBase.duplicateUploadRows,
      matchedUploadGroups,
      unmatchedUploadGroups,
      leadsToUpdate,
      fieldsAdded,
      fieldsOverwritten,
      fieldsUnchanged,
    },
  };
}
