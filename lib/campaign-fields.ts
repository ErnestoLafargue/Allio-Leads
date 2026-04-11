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

/** Altid under CVR i alle kampagner (nøgler bruges i import + reklame-filter). */
export const DEFAULT_CVR_EXTENSION_FIELDS: CampaignExtraField[] = [
  { key: "reklamebeskyttet", label: "Reklamebeskyttet" },
  { key: "virksomhedsform", label: "Virksomhedsform" },
];

const DEFAULT_CVR_KEYS = new Set(DEFAULT_CVR_EXTENSION_FIELDS.map((f) => f.key));

export function isFixedCvrExtensionKey(key: string): boolean {
  return DEFAULT_CVR_KEYS.has(key.trim());
}

const FIXED_PERSON_KEYS = new Set(FIXED_PERSON_EXTENSION_FIELDS.map((f) => f.key));

export function isFixedPersonExtensionKey(key: string): boolean {
  return FIXED_PERSON_KEYS.has(key.trim());
}

export function mergeDefaultExtensions(cfg: CampaignFieldConfig): CampaignFieldConfig {
  const extensions: CampaignFieldConfig["extensions"] = {};
  for (const g of FIELD_GROUPS) {
    if (g === "companyName") {
      const existing = cfg.extensions.companyName ?? [];
      const fixedKeys = new Set(FIXED_PERSON_EXTENSION_FIELDS.map((f) => f.key));
      const merged: CampaignExtraField[] = [...FIXED_PERSON_EXTENSION_FIELDS];
      for (const f of existing) {
        if (!fixedKeys.has(f.key)) merged.push(f);
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
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[øØ]/g, "o")
    .replace(/[æÆ]/g, "ae")
    .replace(/[åÅ]/g, "aa");
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
