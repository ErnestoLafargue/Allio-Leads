export const FIELD_GROUPS = [
  "companyName",
  "phone",
  "email",
  "cvr",
  "address",
  "postalCode",
  "city",
  "industry",
] as const;

export type FieldGroupKey = (typeof FIELD_GROUPS)[number];

export const FIELD_GROUP_LABELS: Record<FieldGroupKey, string> = {
  companyName: "Virksomhedsnavn",
  phone: "Telefonnummer",
  email: "E-mail",
  cvr: "CVR-nummer",
  address: "Adresse",
  postalCode: "Postnr.",
  city: "By",
  industry: "Branche",
};

export type CampaignExtraField = {
  key: string;
  label: string;
};

export type CampaignFieldConfig = {
  extensions: Partial<Record<FieldGroupKey, CampaignExtraField[]>>;
};

export const FIXED_PERSON_EXTENSION_FIELDS: CampaignExtraField[] = [
  { key: "stifter", label: "Stifter" },
  { key: "direktor", label: "Direktør" },
  { key: "fuldt_ansvarlig_person", label: "Fuldt ansvarlig deltager" },
];

/** Altid som sidste felt under Virksomhedsnavn (efter personfelterne). */
export const FIXED_DOMAIN_EXTENSION_FIELD: CampaignExtraField = {
  key: "domaene",
  label: "Domæne",
};

/** Standardfelter under Virksomhedsnavn i rækkefølge. */
export const FIXED_COMPANY_NAME_EXTENSION_FIELDS: CampaignExtraField[] = [
  ...FIXED_PERSON_EXTENSION_FIELDS,
  FIXED_DOMAIN_EXTENSION_FIELD,
];

/** Altid under CVR i alle kampagner (nøgler bruges i import + reklame-filter). */
export const DEFAULT_CVR_EXTENSION_FIELDS: CampaignExtraField[] = [
  { key: "reklamebeskyttet", label: "Reklamebeskyttet" },
  { key: "virksomhedsform", label: "Virksomhedsform" },
];

/**
 * Valgfrie standardfelter under E-mail — kun når Annoncer er slået til på kampagnen.
 * Merges ikke automatisk ind i alle kampagner (i modsætning til Stifter/CVR).
 */
export const FIXED_EMAIL_ANNONCER_FIELDS: CampaignExtraField[] = [
  { key: "annoncer", label: "Annoncer" },
  { key: "kanaler", label: "Kanaler" },
  { key: "antal_kampagner", label: "Antal kampagner" },
  { key: "egenkapital", label: "Egenkapital" },
];

const DEFAULT_CVR_KEYS = new Set(DEFAULT_CVR_EXTENSION_FIELDS.map((f) => f.key));
const FIXED_EMAIL_ANNONCER_KEYS = new Set(FIXED_EMAIL_ANNONCER_FIELDS.map((f) => f.key));

export function isFixedCvrExtensionKey(key: string): boolean {
  return DEFAULT_CVR_KEYS.has(key.trim());
}

export function isFixedEmailAnnoncerKey(key: string): boolean {
  return FIXED_EMAIL_ANNONCER_KEYS.has(key.trim());
}

/** True hvis kampagnens fieldConfig har alle Annoncer-standardfelter under e-mail. */
export function hasAnnoncerEmailFields(cfg: CampaignFieldConfig): boolean {
  const email = cfg.extensions.email ?? [];
  return FIXED_EMAIL_ANNONCER_FIELDS.every((fixed) => email.some((f) => f.key === fixed.key));
}

/** Indsætter Annoncer-felterne øverst under e-mail (bevarer øvrige e-mail-felter). */
export function enableAnnoncerEmailFields(cfg: CampaignFieldConfig): CampaignFieldConfig {
  const existing = cfg.extensions.email ?? [];
  const withoutFixed = existing.filter((f) => !isFixedEmailAnnoncerKey(f.key));
  return {
    extensions: {
      ...cfg.extensions,
      email: [...FIXED_EMAIL_ANNONCER_FIELDS, ...withoutFixed],
    },
  };
}

/** Fjerner kun Annoncer-nøglerne under e-mail (bevarer øvrige felter og lead-data). */
export function disableAnnoncerEmailFields(cfg: CampaignFieldConfig): CampaignFieldConfig {
  const existing = cfg.extensions.email ?? [];
  const next = existing.filter((f) => !isFixedEmailAnnoncerKey(f.key));
  const extensions: CampaignFieldConfig["extensions"] = { ...cfg.extensions };
  if (next.length) extensions.email = next;
  else delete extensions.email;
  return { extensions };
}

/** True hvis import-mapping pege på mindst ét Annoncer-felt (`custom:annoncer` osv.). */
export function mappingTargetsAnnoncerFields(
  mapping: Record<string, string> | null | undefined,
): boolean {
  if (!mapping) return false;
  for (const target of Object.values(mapping)) {
    if (typeof target !== "string" || !target.startsWith("custom:")) continue;
    if (isFixedEmailAnnoncerKey(target.slice("custom:".length))) return true;
  }
  return false;
}

/** True hvis mindst ét Annoncer-felt har en ikke-tom værdi. */
export function customFieldsHaveAnnoncerData(custom: Record<string, string>): boolean {
  return FIXED_EMAIL_ANNONCER_FIELDS.some((f) => (custom[f.key] ?? "").trim().length > 0);
}

const FIXED_PERSON_KEYS = new Set(FIXED_PERSON_EXTENSION_FIELDS.map((f) => f.key));
const FIXED_DOMAIN_KEY = FIXED_DOMAIN_EXTENSION_FIELD.key;

function normalizeFieldToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[øØ]/g, "o")
    .replace(/[æÆ]/g, "ae")
    .replace(/[åÅ]/g, "aa");
}

/** True for tidligere manuelt tilføjede Domæne-varianter (skjules ved merge). */
export function isLegacyDomainExtensionField(key: string, label?: string): boolean {
  const kn = normalizeFieldToken(key);
  const ln = label ? normalizeFieldToken(label) : "";
  if (kn === FIXED_DOMAIN_KEY || kn === "domain") return true;
  if (ln === "domaene" || ln === "domain") return true;
  return kn === "domaene" || kn.includes("domaene");
}

export function isFixedPersonExtensionKey(key: string): boolean {
  return FIXED_PERSON_KEYS.has(key.trim());
}

export function isFixedDomainExtensionKey(key: string): boolean {
  return key.trim() === FIXED_DOMAIN_KEY;
}

export function isFixedCompanyNameExtensionKey(key: string, label?: string): boolean {
  return (
    isFixedPersonExtensionKey(key) ||
    isFixedDomainExtensionKey(key) ||
    isLegacyDomainExtensionField(key, label)
  );
}

export function mergeDefaultExtensions(cfg: CampaignFieldConfig): CampaignFieldConfig {
  const extensions: CampaignFieldConfig["extensions"] = {};
  for (const g of FIELD_GROUPS) {
    if (g === "companyName") {
      const existing = cfg.extensions.companyName ?? [];
      const fixedKeys = new Set(FIXED_COMPANY_NAME_EXTENSION_FIELDS.map((f) => f.key));
      const merged: CampaignExtraField[] = [...FIXED_COMPANY_NAME_EXTENSION_FIELDS];
      for (const f of existing) {
        if (fixedKeys.has(f.key)) continue;
        if (isLegacyDomainExtensionField(f.key, f.label)) continue;
        merged.push(f);
      }
      extensions.companyName = merged;
      continue;
    }
    if (g === "cvr") {
      const existing = cfg.extensions.cvr ?? [];
      const merged: CampaignExtraField[] = [...DEFAULT_CVR_EXTENSION_FIELDS];
      for (const f of existing) {
        if (!DEFAULT_CVR_KEYS.has(f.key)) merged.push(f);
      }
      extensions.cvr = merged;
      continue;
    }
    if (g === "email") {
      // Annoncer-felter merges ikke automatisk — kun når de allerede ligger i config.
      // Hvis de findes, sikres kanonisk rækkefølge (status → kanaler → antal → egenkapital) først.
      const existing = cfg.extensions.email ?? [];
      if (!existing.length) continue;
      const hasAnyAnnoncer = existing.some((f) => isFixedEmailAnnoncerKey(f.key));
      if (!hasAnyAnnoncer) {
        extensions.email = existing;
        continue;
      }
      const withoutFixed = existing.filter((f) => !isFixedEmailAnnoncerKey(f.key));
      const presentFixed = FIXED_EMAIL_ANNONCER_FIELDS.filter((fixed) =>
        existing.some((f) => f.key === fixed.key),
      );
      extensions.email = [...presentFixed, ...withoutFixed];
      continue;
    }
    const list = cfg.extensions[g];
    if (list?.length) extensions[g] = list;
  }
  return { extensions };
}

export function emptyFieldConfig(): CampaignFieldConfig {
  return { extensions: {} };
}

export function parseFieldConfig(raw: string | null | undefined): CampaignFieldConfig {
  const base = ((): CampaignFieldConfig => {
    if (!raw?.trim()) return emptyFieldConfig();
    try {
      const v = JSON.parse(raw) as unknown;
      if (!v || typeof v !== "object" || !("extensions" in v)) return emptyFieldConfig();
      const ex = (v as CampaignFieldConfig).extensions;
      if (!ex || typeof ex !== "object") return emptyFieldConfig();
      const extensions: CampaignFieldConfig["extensions"] = {};
      for (const g of FIELD_GROUPS) {
        const arr = ex[g];
        if (!Array.isArray(arr)) continue;
        const list: CampaignExtraField[] = [];
        for (const item of arr) {
          if (!item || typeof item !== "object") continue;
          const key = typeof item.key === "string" ? item.key : "";
          const label = typeof item.label === "string" ? item.label : "";
          if (key && label) list.push({ key, label });
        }
        if (list.length) extensions[g] = list;
      }
      return { extensions };
    } catch {
      return emptyFieldConfig();
    }
  })();
  return mergeDefaultExtensions(base);
}

function normalizeLabel(label: string): string {
  return normalizeFieldToken(label);
}

/**
 * Finder kampagnens «Start dato»-felt (import/ekstra felt), så filter/sortering kan bruge `customFields[key]`.
 */
export function findStartDateExtensionField(cfg: CampaignFieldConfig): CampaignExtraField | null {
  let fuzzy: CampaignExtraField | null = null;
  for (const g of FIELD_GROUPS) {
    for (const f of cfg.extensions[g] ?? []) {
      const kn = normalizeLabel(f.key);
      const ln = normalizeLabel(f.label);
      if (
        kn === "start_dato" ||
        kn === "startdato" ||
        ln === "start dato" ||
        ln === "startdato"
      ) {
        return f;
      }
      if (!fuzzy && ln.includes("start") && ln.includes("dato")) {
        fuzzy = f;
      }
    }
  }
  return fuzzy;
}

export function resolveFixedPersonFieldKeys(cfg: CampaignFieldConfig): Record<"stifter" | "direktor" | "fuldtAnsvarligPerson", string> {
  const out = {
    stifter: "stifter",
    direktor: "direktor",
    fuldtAnsvarligPerson: "fuldt_ansvarlig_person",
  };

  for (const g of FIELD_GROUPS) {
    for (const f of cfg.extensions[g] ?? []) {
      const keyNorm = normalizeLabel(f.key);
      const labelNorm = normalizeLabel(f.label);
      if (keyNorm === "stifter" || labelNorm.includes("stifter")) out.stifter = f.key;
      if (keyNorm === "direktor" || labelNorm.includes("direktor")) out.direktor = f.key;
      if (
        keyNorm.includes("fuldt_ansvarlig") ||
        labelNorm.includes("fuldt ansvarlig") ||
        /\bfad\b/.test(labelNorm)
      ) {
        out.fuldtAnsvarligPerson = f.key;
      }
    }
  }

  return out;
}

export function serializeFieldConfig(cfg: CampaignFieldConfig): string {
  return JSON.stringify({ extensions: cfg.extensions ?? {} });
}

export function defaultCampaignFieldConfigJson(): string {
  return serializeFieldConfig(mergeDefaultExtensions(emptyFieldConfig()));
}

export function slugifyKey(label: string, existing: Set<string>): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[æ]/g, "ae")
      .replace(/[ø]/g, "o")
      .replace(/[å]/g, "aa")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 48) || "felt";
  let k = base;
  let n = 1;
  while (existing.has(k)) {
    k = `${base}_${n++}`;
  }
  existing.add(k);
  return k;
}
