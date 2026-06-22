/**
 * Podio API-klient (app-authentication pr. app).
 *
 * Allio bruger Podio som CRM. Vi tilgår hver app med "app authentication"
 * (grant_type=app) — en token scoped til netop den app. Det er sikkert og
 * skalerbart: ingen bruger-login, og hver app har sin egen token.
 *
 * Felter slås op via deres ETIKET (label) gennem app-konfigurationen, så
 * integrationen ikke afhænger af tekniske felt-id'er. Se docs/PODIO-SETUP.md.
 *
 * Alle kald er defensive: kaster ved fejl, så kaldere kan fange ikke-fatalt
 * (en booking må aldrig fejle, fordi Podio er nede).
 */

const OAUTH_URL = "https://podio.com/oauth/token";
const API_BASE = "https://api.podio.com";
const APP_CONFIG_TTL_MS = 5 * 60 * 1000;

export type PodioAppKey = "kunder" | "moeder" | "processer" | "betaling" | "levering";

type AppEnv = { id: string; token: string };

function clientId(): string {
  return (process.env.PODIO_CLIENT_ID ?? "").trim();
}
function clientSecret(): string {
  return (process.env.PODIO_CLIENT_SECRET ?? "").trim();
}

function appEnv(app: PodioAppKey): AppEnv {
  const map: Record<PodioAppKey, AppEnv> = {
    kunder: {
      id: (process.env.PODIO_KUNDER_APP_ID ?? "").trim(),
      token: (process.env.PODIO_KUNDER_APP_TOKEN ?? "").trim(),
    },
    moeder: {
      id: (process.env.PODIO_MOEDER_APP_ID ?? "").trim(),
      token: (process.env.PODIO_MOEDER_APP_TOKEN ?? "").trim(),
    },
    processer: {
      id: (process.env.PODIO_PROCESSER_APP_ID ?? "").trim(),
      token: (process.env.PODIO_PROCESSER_APP_TOKEN ?? "").trim(),
    },
    betaling: {
      id: (process.env.PODIO_BETALING_APP_ID ?? "").trim(),
      token: (process.env.PODIO_BETALING_APP_TOKEN ?? "").trim(),
    },
    levering: {
      id: (process.env.PODIO_LEVERING_APP_ID ?? "").trim(),
      token: (process.env.PODIO_LEVERING_APP_TOKEN ?? "").trim(),
    },
  };
  return map[app];
}

/** True hvis Podio er konfigureret (client + mindst Kunder-app). */
export function isPodioConfigured(): boolean {
  const k = appEnv("kunder");
  return Boolean(clientId() && clientSecret() && k.id && k.token);
}

function isAppConfigured(app: PodioAppKey): boolean {
  const a = appEnv(app);
  return Boolean(clientId() && clientSecret() && a.id && a.token);
}

/** True hvis en specifik Podio-app er konfigureret (bruges til feature-gating). */
export function isPodioAppConfigured(app: PodioAppKey): boolean {
  return isAppConfigured(app);
}

// --- Token-cache (pr. app) -------------------------------------------------

type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<PodioAppKey, CachedToken>();

async function getAccessToken(app: PodioAppKey): Promise<string> {
  const cached = tokenCache.get(app);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const a = appEnv(app);
  if (!isAppConfigured(app)) {
    throw new Error(`Podio app "${app}" er ikke konfigureret (mangler id/token/client).`);
  }

  const body = new URLSearchParams({
    grant_type: "app",
    app_id: a.id,
    app_token: a.token,
    client_id: clientId(),
    client_secret: clientSecret(),
  });

  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Podio token-fejl (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Podio token-svar uden access_token.");

  const ttlMs = Math.max(60, (json.expires_in ?? 28800) - 60) * 1000;
  tokenCache.set(app, { token: json.access_token, expiresAt: Date.now() + ttlMs });
  return json.access_token;
}

// --- Lav-niveau request ----------------------------------------------------

async function podioRequest(
  app: PodioAppKey,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const token = await getAccessToken(app);
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `OAuth2 ${token}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

// --- App-konfiguration (felt-opslag via label) -----------------------------

type PodioCategoryOption = { id: number; text?: string; status?: string };
type PodioField = {
  field_id: number;
  external_id: string;
  label: string;
  type: string;
  config?: { settings?: { options?: PodioCategoryOption[] } };
};
type PodioAppConfig = { fields: PodioField[] };

type CachedConfig = { config: PodioAppConfig; expiresAt: number };
const configCache = new Map<PodioAppKey, CachedConfig>();

function normalizeLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/gu, " ");
}

async function getAppConfig(app: PodioAppKey): Promise<PodioAppConfig> {
  const cached = configCache.get(app);
  if (cached && cached.expiresAt > Date.now()) return cached.config;

  const a = appEnv(app);
  const { status, json } = await podioRequest(app, "GET", `/app/${a.id}`);
  if (status !== 200 || !json || typeof json !== "object") {
    throw new Error(`Podio app-config fejl (${status}) for "${app}".`);
  }
  const config = json as PodioAppConfig;
  configCache.set(app, { config, expiresAt: Date.now() + APP_CONFIG_TTL_MS });
  return config;
}

function findFieldByLabel(config: PodioAppConfig, label: string): PodioField | null {
  const want = normalizeLabel(label);
  return config.fields.find((f) => normalizeLabel(f.label) === want) ?? null;
}

/** Hent felt-metadata (external_id + type) via etiket. */
export async function resolveFieldMeta(
  app: PodioAppKey,
  label: string,
): Promise<{ externalId: string; type: string }> {
  const config = await getAppConfig(app);
  const field = findFieldByLabel(config, label);
  if (!field) throw new Error(`Podio-felt "${label}" findes ikke i app "${app}".`);
  return { externalId: field.external_id, type: field.type };
}

/** Oversæt felt-etiket til Podios external_id. Kaster hvis feltet ikke findes. */
export async function resolveFieldExternalId(app: PodioAppKey, label: string): Promise<string> {
  return (await resolveFieldMeta(app, label)).externalId;
}

/**
 * Sæt feltværdi med korrekt Podio-format baseret på feltets type.
 * Understøtter text, phone, email, embed (link), number, location og member.
 */
export async function setPodioFieldValue(
  app: PodioAppKey,
  fields: PodioFieldValues,
  label: string,
  value: string | number | null | undefined,
  opts?: { memberUserIds?: number[] },
): Promise<void> {
  if (value === null || value === undefined) return;
  const str = String(value).trim();
  if (!str && !opts?.memberUserIds?.length) return;

  const { externalId, type } = await resolveFieldMeta(app, label);

  switch (type) {
    case "phone":
      fields[externalId] = [{ type: "mobile", value: str }];
      break;
    case "email":
      // Podio email-felter er kontakt-felter: kræver {type,value}, ikke en ren streng.
      // Gyldige typer: work, home, other.
      fields[externalId] = [{ type: "work", value: str }];
      break;
    case "embed":
      fields[externalId] = { url: str, title: str };
      break;
    case "number": {
      const n = Number(str.replace(/\s/g, ""));
      fields[externalId] = Number.isFinite(n) ? n : str;
      break;
    }
    case "member":
      if (opts?.memberUserIds?.length) {
        fields[externalId] = opts.memberUserIds;
      }
      break;
    case "location":
      fields[externalId] = str;
      break;
    case "text":
    default:
      fields[externalId] = str;
      break;
  }
}

/** Sæt Placering-felt (kombinerer gade, postnr og by fra Allio). */
export async function setPodioLocationValue(
  app: PodioAppKey,
  fields: PodioFieldValues,
  label: string,
  parts: { street?: string; postalCode?: string; city?: string },
): Promise<void> {
  const street = (parts.street ?? "").trim();
  const postalCode = (parts.postalCode ?? "").trim();
  const city = (parts.city ?? "").trim();
  if (!street && !postalCode && !city) return;

  const cityLine = [postalCode, city].filter(Boolean).join(" ");
  const value = [street, cityLine].filter(Boolean).join(", ");
  const { externalId } = await resolveFieldMeta(app, label);
  fields[externalId] = value;
}

/** Oversæt en kategori-valgmulighed (etiket) til dens option-id. */
export async function resolveCategoryOptionId(
  app: PodioAppKey,
  fieldLabel: string,
  optionLabel: string,
): Promise<number> {
  const config = await getAppConfig(app);
  const field = findFieldByLabel(config, fieldLabel);
  if (!field) throw new Error(`Podio kategori-felt "${fieldLabel}" findes ikke i app "${app}".`);
  const want = normalizeLabel(optionLabel);
  const opt = (field.config?.settings?.options ?? []).find(
    (o) => normalizeLabel(o.text ?? o.status ?? "") === want,
  );
  if (!opt) {
    throw new Error(`Podio-kategori "${optionLabel}" findes ikke i felt "${fieldLabel}" (${app}).`);
  }
  return opt.id;
}

// --- Items -----------------------------------------------------------------

export type PodioFieldValues = Record<string, unknown>;

/** Opret item med valgfri external_id (idempotensnøgle). Returnerer item_id. */
export async function createItem(
  app: PodioAppKey,
  opts: { externalId?: string; fields: PodioFieldValues },
): Promise<number> {
  const a = appEnv(app);
  const body: Record<string, unknown> = { fields: opts.fields };
  if (opts.externalId) body.external_id = opts.externalId;
  const { status, json } = await podioRequest(app, "POST", `/item/app/${a.id}/`, body);
  if (status !== 200 && status !== 201) {
    throw new Error(`Podio createItem fejl (${status}) i "${app}": ${JSON.stringify(json).slice(0, 200)}`);
  }
  const itemId = (json as { item_id?: number })?.item_id;
  if (!itemId) throw new Error("Podio createItem svar uden item_id.");
  return itemId;
}

/** Opdatér feltværdier på et eksisterende item. */
export async function updateItemValues(
  app: PodioAppKey,
  itemId: number,
  fields: PodioFieldValues,
): Promise<void> {
  const { status, json } = await podioRequest(app, "PUT", `/item/${itemId}/value`, fields);
  if (status !== 200 && status !== 204) {
    throw new Error(`Podio updateItem fejl (${status}) i "${app}": ${JSON.stringify(json).slice(0, 200)}`);
  }
}

/** Find item via external_id. Returnerer item_id eller null (404). */
export async function findItemIdByExternalId(
  app: PodioAppKey,
  externalId: string,
): Promise<number | null> {
  const a = appEnv(app);
  const { status, json } = await podioRequest(
    app,
    "GET",
    `/item/app/${a.id}/external_id/${encodeURIComponent(externalId)}`,
  );
  if (status === 404) return null;
  if (status !== 200) {
    throw new Error(`Podio findItem fejl (${status}) i "${app}".`);
  }
  return (json as { item_id?: number })?.item_id ?? null;
}

/** Validér en Podio hook.verify-udfordring (aktiverer webhooken). */
export async function validateHook(app: PodioAppKey, hookId: string, code: string): Promise<void> {
  const { status } = await podioRequest(app, "POST", `/hook/${hookId}/verify/validate`, { code });
  if (status !== 200 && status !== 204) {
    throw new Error(`Podio hook-validate fejl (${status}).`);
  }
}
