import { leadDomainFromCustomFields, parseCustomFields, stringifyCustomFields } from "@/lib/custom-fields";
import { COMPANY_TYPE_CUSTOM_KEY } from "@/lib/active-campaign-queue";
import { normalizeCVR } from "@/lib/cvr-import";

export type ImportPatchField =
  | "phone"
  | "email"
  | "domain"
  | "virksomhedstype"
  | "otherCustom";

/** Nøgle der bruges til at finde eksisterende leads under berigelse. */
export type ImportPatchMatchField = "cvr" | "phone" | "email" | "domain";

export const DEFAULT_IMPORT_PATCH_FIELDS: ImportPatchField[] = ["email", "domain", "otherCustom"];

export const IMPORT_PATCH_FIELD_OPTIONS: { id: ImportPatchField; label: string }[] = [
  { id: "phone", label: "Virksomhed Tlf" },
  { id: "email", label: "E-mail" },
  { id: "domain", label: "Domæne" },
  { id: "virksomhedstype", label: "Virksomhedstype" },
  { id: "otherCustom", label: "Øvrige mappede kampagnefelter" },
];

export const IMPORT_PATCH_MATCH_OPTIONS: { id: ImportPatchMatchField; label: string }[] = [
  { id: "cvr", label: "CVR" },
  { id: "phone", label: "Telefonnummer" },
  { id: "email", label: "E-mail" },
  { id: "domain", label: "Domæne / hjemmeside" },
];

export type ImportPatchFieldCounts = Partial<Record<ImportPatchField, number>>;

export type ImportPatchLeadInput = {
  id: string;
  phone: string;
  email: string;
  customFields: string;
};

export type ImportPatchIncoming = {
  phone: string;
  email: string;
  /** Domæne fra mapping (domain/domaene) eller e-mailens host. */
  domain: string;
  custom: Record<string, string>;
};

export type ImportPatchResult = {
  patch: Record<string, unknown>;
  fieldCounts: ImportPatchFieldCounts;
};

export type ImportPatchMatchLead = {
  id: string;
  campaignId: string | null;
  cvr: string;
  phone: string;
  email: string;
  customFields: string;
};

function isEmpty(v: string | null | undefined): boolean {
  return !(v ?? "").trim();
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

export function parseImportPatchFields(raw: unknown): ImportPatchField[] | null {
  if (!Array.isArray(raw)) return null;
  const allowed = new Set(IMPORT_PATCH_FIELD_OPTIONS.map((o) => o.id));
  const out: ImportPatchField[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    if (!allowed.has(item as ImportPatchField)) continue;
    if (!out.includes(item as ImportPatchField)) out.push(item as ImportPatchField);
  }
  return out;
}

export function parseImportPatchMatchField(raw: unknown): ImportPatchMatchField {
  if (raw === "phone" || raw === "email" || raw === "domain") return raw;
  return "cvr";
}

/** Domæne til patch: mappet custom-værdi, ellers host fra e-mail. */
export function resolveIncomingDomain(custom: Record<string, string>, email: string): string {
  const fromCustom =
    custom.domaene?.trim() ||
    custom.domain?.trim() ||
    custom.hjemmeside?.trim() ||
    custom.website?.trim() ||
    "";
  if (fromCustom) return fromCustom;
  const at = email.indexOf("@");
  if (at >= 0) {
    const host = email.slice(at + 1).trim();
    if (host) return host;
  }
  return "";
}

/** Match-værdi for en upload-række. */
export function getIncomingMatchValue(
  incoming: { cvr: string; phone: string; email: string; domain: string },
  matchField: ImportPatchMatchField,
): string {
  if (matchField === "cvr") return normalizeCVR(incoming.cvr) ?? "";
  if (matchField === "phone") return normalizePhone(incoming.phone);
  if (matchField === "email") return normalizeEmail(incoming.email);
  return normalizeDomain(incoming.domain);
}

/** Match-værdi for et eksisterende lead. */
export function getLeadMatchValue(
  lead: ImportPatchMatchLead,
  matchField: ImportPatchMatchField,
): string {
  if (matchField === "cvr") return normalizeCVR(lead.cvr) ?? "";
  if (matchField === "phone") return normalizePhone(lead.phone);
  if (matchField === "email") return normalizeEmail(lead.email);
  return normalizeDomain(leadDomainFromCustomFields(lead.customFields));
}

/**
 * Bygger indeks: match-nøgle → lead-ids.
 * Scope: kun valgt kampagne, eller alle kampagner.
 */
export function indexLeadsForPatchMatch(params: {
  leads: ImportPatchMatchLead[];
  matchField: ImportPatchMatchField;
  campaignId: string;
  allCampaigns: boolean;
}): Map<string, string[]> {
  const { leads, matchField, campaignId, allCampaigns } = params;
  const map = new Map<string, string[]>();
  for (const lead of leads) {
    if (!allCampaigns && lead.campaignId !== campaignId) continue;
    const key = getLeadMatchValue(lead, matchField);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(lead.id);
    map.set(key, list);
  }
  return map;
}

/**
 * Bygger et PATCH for ét lead: kun tomme felter blandt de valgte patchFields.
 * Status og noter ændres aldrig.
 */
export function buildImportPatchForLead(params: {
  lead: ImportPatchLeadInput;
  incoming: ImportPatchIncoming;
  patchFields: ImportPatchField[];
}): ImportPatchResult {
  const { lead, incoming, patchFields } = params;
  const wants = new Set(patchFields);
  const existingCustom = parseCustomFields(lead.customFields);
  const mergedCustom = { ...existingCustom };
  let customChanged = false;
  const fieldCounts: ImportPatchFieldCounts = {};
  const patch: Record<string, unknown> = {};

  if (wants.has("phone") && isEmpty(lead.phone) && !isEmpty(incoming.phone)) {
    patch.phone = incoming.phone.trim();
    fieldCounts.phone = 1;
  }

  if (wants.has("email") && isEmpty(lead.email) && !isEmpty(incoming.email)) {
    patch.email = incoming.email.trim();
    fieldCounts.email = 1;
  }

  if (wants.has("domain")) {
    const existingDomain = leadDomainFromCustomFields(lead.customFields);
    if (isEmpty(existingDomain) && !isEmpty(incoming.domain)) {
      mergedCustom.domaene = incoming.domain.trim();
      customChanged = true;
      fieldCounts.domain = 1;
    }
  }

  if (wants.has("virksomhedstype")) {
    const existing = (existingCustom[COMPANY_TYPE_CUSTOM_KEY] ?? "").trim();
    const incomingType =
      (incoming.custom[COMPANY_TYPE_CUSTOM_KEY] ?? "").trim() ||
      (incoming.custom.virksomheds_type ?? "").trim();
    if (isEmpty(existing) && !isEmpty(incomingType)) {
      mergedCustom[COMPANY_TYPE_CUSTOM_KEY] = incomingType;
      customChanged = true;
      fieldCounts.virksomhedstype = 1;
    }
  }

  if (wants.has("otherCustom")) {
    let otherUpdated = false;
    for (const [k, v] of Object.entries(incoming.custom)) {
      if (!v.trim()) continue;
      if (k === COMPANY_TYPE_CUSTOM_KEY || k === "virksomheds_type") continue;
      if (k === "domaene" || k === "domain" || k === "hjemmeside" || k === "website") continue;
      if (!(existingCustom[k] ?? "").trim()) {
        mergedCustom[k] = v.trim();
        customChanged = true;
        otherUpdated = true;
      }
    }
    if (otherUpdated) fieldCounts.otherCustom = 1;
  }

  if (customChanged) {
    patch.customFields = stringifyCustomFields(mergedCustom);
  }

  return { patch, fieldCounts };
}

export function mergeFieldCounts(
  target: ImportPatchFieldCounts,
  source: ImportPatchFieldCounts,
): void {
  for (const [key, n] of Object.entries(source) as [ImportPatchField, number | undefined][]) {
    if (!n) continue;
    target[key] = (target[key] ?? 0) + n;
  }
}
