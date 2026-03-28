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

/** Altid under CVR i alle kampagner (nøgler bruges i import + reklame-filter). */
export const DEFAULT_CVR_EXTENSION_FIELDS: CampaignExtraField[] = [
  { key: "reklamebeskyttet", label: "Reklamebeskyttet" },
  { key: "virksomhedsform", label: "Virksomhedsform" },
];

const DEFAULT_CVR_KEYS = new Set(DEFAULT_CVR_EXTENSION_FIELDS.map((f) => f.key));

export function isFixedCvrExtensionKey(key: string): boolean {
  return DEFAULT_CVR_KEYS.has(key.trim());
}

export function mergeDefaultExtensions(cfg: CampaignFieldConfig): CampaignFieldConfig {
  const extensions: CampaignFieldConfig["extensions"] = {};
  for (const g of FIELD_GROUPS) {
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
