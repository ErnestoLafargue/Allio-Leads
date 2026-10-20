import {
  normalizePhoneToE164ForDial,
  stripDialFormatting,
} from "@/lib/phone-e164";
import { isPowerSonioxUnavailableError } from "@/lib/power-greeting-soniox";

function resolveOutboundCallFromField(from: string): string {
  const t = from.trim();
  if (!t) return t;
  return normalizePhoneToE164ForDial(t) ?? stripDialFormatting(t);
}

/** PSTN/E.164 — uden mellemrum. SIP-URI (`sip:…`) må ikke ændres. */
function resolveOutboundCallToField(to: string): string {
  const t = to.trim();
  if (!t) return t;
  if (/^sip:/i.test(t)) return t;
  return normalizePhoneToE164ForDial(t) ?? stripDialFormatting(t);
}

/** `TELNYX_API_BASE_URL` må kun sættes til en lokal mock ved test af Power Dialer-flowet. */
const TELNYX_API_BASE = process.env.TELNYX_API_BASE_URL?.trim() || "https://api.telnyx.com/v2";

/** Call Control application id (portal kalder det ofte Application ID). */
export function getTelnyxConnectionId(): string | null {
  const c =
    process.env.TELNYX_CONNECTION_ID?.trim() || process.env.TELNYX_APPLICATION_ID?.trim();
  return c || null;
}

/** Credential-id til WebRTC login_token. */
export function getTelnyxTelephonyCredentialId(): string | null {
  const id = process.env.TELNYX_TELEPHONY_CREDENTIAL_ID?.trim();
  return id || null;
}

function parseFromNumbersList(): string[] {
  const raw = process.env.TELNYX_FROM_NUMBERS?.trim();
  if (!raw) return [];
  // Komma, semikolon eller linjeskift – undgå at hele strengen læses som ét nummer
  return raw
    .split(/[,;\n\r]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type OutboundFromPoolInfo = {
  /** Antal ugyldige/duplikerede filtre væk */
  size: number;
  /** True når både TELNYX_FROM_NUMBERS og TELNYX_FROM_NUMBER er ugyldige/ tomme */
  isEmpty: boolean;
  /** Første 2 cifre + sidste 2 pr. nummer til fejlsøgning (ingen fuld nummerværdi i log) */
  sampleMasked: string[];
};

/**
 * Alle gyldige E.164-udgangsnumre (deduplikeret) fra miljøet.
 * Prioritet: 1) TELNYX_FROM_NUMBERS (flere) 2) ellers TELNYX_FROM_NUMBER (enkel fallback).
 */
export function getTelnyxFromNumberPoolE164(): string[] {
  const list = parseFromNumbersList();
  const normalized = list
    .map((n) => normalizePhoneToE164ForDial(n))
    .filter((n): n is string => Boolean(n));
  if (normalized.length > 0) {
    return [...new Set(normalized)];
  }
  const single = process.env.TELNYX_FROM_NUMBER?.trim();
  if (!single) return [];
  const e = normalizePhoneToE164ForDial(single);
  return e ? [e] : [];
}

function maskE164ForDebug(e164: string): string {
  const d = e164.replace(/\D/g, "");
  if (d.length <= 4) return "••••";
  return `+${d.slice(0, 2)}…${d.slice(-2)}`;
}

export function getTelnyxFromPoolInfo(): OutboundFromPoolInfo {
  const pool = getTelnyxFromNumberPoolE164();
  return {
    size: pool.length,
    isEmpty: pool.length === 0,
    sampleMasked: pool.slice(0, 6).map(maskE164ForDebug),
  };
}

/**
 * Vælger afsender-CLI (ét af jeres Telnyx-numre).
 *
 * - **Flere numre** (`TELNYX_FROM_NUMBERS` kommasepareret): fordeling med stabil hash
 *   over `leadId` + valgfri `userId` + `extraSalt` så forskellige sælgere og parallelle
 *   opkald spreder sig jævnere over købte numre end kun leadId alene.
 * - **Kun ét numre** (kun `TELNYX_FROM_NUMBER` eller ét felt i listen): returer altid det — skal
 *   fikses i Vercel med `TELNYX_FROM_NUMBERS=+45...,+45...,+45...,+45...` for at få 4 li linjer.
 */
export function pickTelnyxFromNumber(
  leadId: string,
  options?: { userId?: string; extraSalt?: string },
): string | null {
  const pool = getTelnyxFromNumberPoolE164();
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0] ?? null;
  const routingKey = [leadId, options?.userId ?? "", options?.extraSalt ?? ""].join("\0");
  let h = 0;
  for (let i = 0; i < routingKey.length; i++) {
    h = (h * 31 + routingKey.charCodeAt(i)) | 0;
  }
  return pool[Math.abs(h) % pool.length] ?? null;
}

/** Telnyx sender ofte connection_id som tal i JSON — det skal stadig kunne caches som tekst. */
export function telnyxIdField(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * GET /telephony_credentials/{id} har `resource_id: "connection:…"` — ikke `connection_id`.
 * Uden det kan vi ikke slå SIP URI-opkald til, og Power Dialer rammer aldrig sælgerens WebRTC.
 */
export function connectionIdFromTelnyxCredentialData(d: Record<string, unknown>): string | null {
  const direct = telnyxIdField(d.connection_id);
  if (direct) return direct;
  const resource = typeof d.resource_id === "string" ? d.resource_id.trim() : "";
  const m = /^connection:(.+)$/i.exec(resource);
  if (m?.[1]?.trim()) return m[1].trim();
  if (d.connection && typeof d.connection === "object") {
    return telnyxIdField((d.connection as Record<string, unknown>).id);
  }
  return null;
}

function formatTelnyxError(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const errors = (json as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = errors[0];
  if (!first || typeof first !== "object") return null;
  const o = first as { detail?: string; title?: string; code?: string };
  const parts = [o.detail, o.title, o.code].filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );
  return parts.length ? parts.join(" — ") : null;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Timeout efter ${timeoutMs} ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Klassificerer Telnyx-kapacitetsfejl (for få samtidige kanaler på connection/app).
 * Bruges til typed fejlretur i API-routes og bridge-flow.
 */
export function isTelnyxChannelLimitError(input: unknown): boolean {
  const text = typeof input === "string" ? input : JSON.stringify(input ?? "");
  return /channel\s+limit\s+exceeded|concurrent\s+calls.*connection|error\s*d3/i.test(text);
}

export type DialResult =
  | { ok: true; callControlId: string; callSessionId?: string; raw: unknown }
  | { ok: false; status: number; message: string; telnyx?: unknown };

export type WebRtcTokenResult =
  | { ok: true; token: string; raw: unknown }
  | { ok: false; status: number; message: string; telnyx?: unknown };

export type TelnyxCredentialInfo = {
  found: boolean;
  id?: string;
  status?: string;
  expired?: boolean;
  expiresAt?: string | null;
  connectionId?: string | null;
  /** Telephony credentialets SIP-brugernavn (gencred…) — WebRTC-klientens registrering. */
  sipUsername?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  tag?: string | null;
  name?: string | null;
  raw?: unknown;
  fetchError?: string;
};

export type TelnyxCredentialSummary = {
  id: string;
  name: string | null;
  status: string | null;
  expired: boolean | null;
  expiresAt: string | null;
  connectionId: string | null;
  tag: string | null;
  createdAt: string | null;
  sipUsername: string | null;
};

function normalizeCredentialRecord(d: Record<string, unknown>): TelnyxCredentialSummary | null {
  const toStr = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;
  const id = telnyxIdField(d.id) ?? toStr(d.id);
  if (!id) return null;
  const status = toStr(d.status);
  const expired =
    typeof d.expired === "boolean"
      ? d.expired
      : typeof status === "string"
        ? status.toLowerCase() === "expired"
        : null;
  return {
    id,
    name: toStr(d.name) ?? toStr(d.tag),
    status,
    expired,
    expiresAt: toStr(d.expires_at),
    connectionId: connectionIdFromTelnyxCredentialData(d),
    tag: toStr(d.tag),
    createdAt: toStr(d.created_at),
    sipUsername: toStr(d.sip_username),
  };
}

export type TelnyxListCredentialsResult =
  | { ok: true; credentials: TelnyxCredentialSummary[]; raw: unknown }
  | { ok: false; status: number; message: string; telnyx?: unknown };

/** GET /v2/telephony_credentials - lister alle Telephony Credentials på kontoen. */
export async function listTelnyxCredentials(params: {
  apiKey: string;
}): Promise<TelnyxListCredentialsResult> {
  try {
    // Bemærk: Telnyx' JSON:API pagination kræver både page[number] og page[size]
    // hvis man bruger dem, og brackets skal være URL-encoded for at undgå HTTP 422
    // hos visse proxies. Vi bruger URLSearchParams for korrekt encoding.
    const qs = new URLSearchParams();
    qs.set("page[number]", "1");
    qs.set("page[size]", "100");
    const res = await fetch(`${TELNYX_API_BASE}/telephony_credentials?${qs.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        Accept: "application/json",
      },
    });
    const rawText = await res.text().catch(() => "");
    let json: unknown = null;
    if (rawText && rawText.trim().startsWith("{")) {
      try {
        json = JSON.parse(rawText);
      } catch {
        json = null;
      }
    }
    if (!res.ok) {
      const detail = formatTelnyxError(json);
      const snippet = rawText.length > 300 ? `${rawText.slice(0, 300)}…` : rawText;
      return {
        ok: false,
        status: res.status,
        message:
          detail ||
          (snippet && !snippet.trim().startsWith("<")
            ? `Telnyx HTTP ${res.status} — ${snippet.trim()}`
            : `Telnyx HTTP ${res.status}`),
        telnyx: json ?? rawText,
      };
    }
    const data =
      json && typeof json === "object" && "data" in json
        ? (json as { data: unknown }).data
        : [];
    const arr: TelnyxCredentialSummary[] = [];
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && typeof item === "object") {
          const normalized = normalizeCredentialRecord(item as Record<string, unknown>);
          if (normalized) arr.push(normalized);
        }
      }
    }
    return { ok: true, credentials: arr, raw: json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Ukendt fejl ved list af credentials.",
    };
  }
}

export type TelnyxCredentialConnection = {
  id: string;
  name: string | null;
  userName: string | null;
  active: boolean | null;
  tags: string[];
  createdAt: string | null;
};

function normalizeCredentialConnection(
  d: Record<string, unknown>,
): TelnyxCredentialConnection | null {
  const toStr = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;
  const id = toStr(d.id);
  if (!id) return null;
  const tagsRaw = Array.isArray(d.tags)
    ? d.tags.filter((x): x is string => typeof x === "string")
    : [];
  return {
    id,
    name: toStr(d.connection_name) ?? toStr(d.name),
    userName: toStr(d.user_name),
    active: typeof d.active === "boolean" ? d.active : null,
    tags: tagsRaw,
    createdAt: toStr(d.created_at),
  };
}

export type TelnyxListCredentialConnectionsResult =
  | { ok: true; connections: TelnyxCredentialConnection[]; raw: unknown }
  | { ok: false; status: number; message: string; telnyx?: unknown };

/** GET /v2/credential_connections?filter[connection_name]=... */
export async function listTelnyxCredentialConnections(params: {
  apiKey: string;
  nameContains?: string;
  tag?: string;
}): Promise<TelnyxListCredentialConnectionsResult> {
  try {
    const qs = new URLSearchParams();
    qs.set("page[number]", "1");
    qs.set("page[size]", "100");
    if (params.nameContains) qs.set("filter[connection_name][contains]", params.nameContains);
    if (params.tag) qs.set("filter[tag]", params.tag);
    const res = await fetch(`${TELNYX_API_BASE}/credential_connections?${qs.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        Accept: "application/json",
      },
    });
    const rawText = await res.text().catch(() => "");
    let json: unknown = null;
    if (rawText && rawText.trim().startsWith("{")) {
      try {
        json = JSON.parse(rawText);
      } catch {
        json = null;
      }
    }
    if (!res.ok) {
      const detail = formatTelnyxError(json);
      const snippet = rawText.length > 300 ? `${rawText.slice(0, 300)}…` : rawText;
      return {
        ok: false,
        status: res.status,
        message:
          detail ||
          (snippet && !snippet.trim().startsWith("<")
            ? `Telnyx HTTP ${res.status} — ${snippet.trim()}`
            : `Telnyx HTTP ${res.status}`),
        telnyx: json ?? rawText,
      };
    }
    const data =
      json && typeof json === "object" && "data" in json
        ? (json as { data: unknown }).data
        : [];
    const arr: TelnyxCredentialConnection[] = [];
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && typeof item === "object") {
          const normalized = normalizeCredentialConnection(item as Record<string, unknown>);
          if (normalized) arr.push(normalized);
        }
      }
    }
    return { ok: true, connections: arr, raw: json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message:
        err instanceof Error ? err.message : "Ukendt fejl ved list af credential connections.",
    };
  }
}

export type TelnyxOutboundVoiceProfile = {
  id: string;
  name: string | null;
};

export type TelnyxListOutboundVoiceProfilesResult =
  | { ok: true; profiles: TelnyxOutboundVoiceProfile[]; raw: unknown }
  | { ok: false; status: number; message: string; telnyx?: unknown };

/** GET /v2/outbound_voice_profiles - lister alle Outbound Voice Profiles. */
export async function listTelnyxOutboundVoiceProfiles(params: {
  apiKey: string;
}): Promise<TelnyxListOutboundVoiceProfilesResult> {
  try {
    const qs = new URLSearchParams();
    qs.set("page[number]", "1");
    qs.set("page[size]", "100");
    const res = await fetch(`${TELNYX_API_BASE}/outbound_voice_profiles?${qs.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        Accept: "application/json",
      },
    });
    const rawText = await res.text().catch(() => "");
    let json: unknown = null;
    if (rawText && rawText.trim().startsWith("{")) {
      try {
        json = JSON.parse(rawText);
      } catch {
        json = null;
      }
    }
    if (!res.ok) {
      const detail = formatTelnyxError(json);
      const snippet = rawText.length > 300 ? `${rawText.slice(0, 300)}…` : rawText;
      return {
        ok: false,
        status: res.status,
        message:
          detail ||
          (snippet && !snippet.trim().startsWith("<")
            ? `Telnyx HTTP ${res.status} — ${snippet.trim()}`
            : `Telnyx HTTP ${res.status}`),
        telnyx: json ?? rawText,
      };
    }
    const data =
      json && typeof json === "object" && "data" in json
        ? (json as { data: unknown }).data
        : [];
    const arr: TelnyxOutboundVoiceProfile[] = [];
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && typeof item === "object") {
          const d = item as Record<string, unknown>;
          const id = typeof d.id === "string" && d.id ? d.id : null;
          if (!id) continue;
          const name = typeof d.name === "string" && d.name ? d.name : null;
          arr.push({ id, name });
        }
      }
    }
    return { ok: true, profiles: arr, raw: json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message:
        err instanceof Error
          ? err.message
          : "Ukendt fejl ved list af outbound voice profiles.",
    };
  }
}

export type TelnyxPatchResult =
  | { ok: true; raw: unknown }
  | { ok: false; status: number; message: string; telnyx?: unknown };

/**
 * PATCH /v2/credential_connections/{id} - opdaterer fx outbound voice profile
 * og anchorsite-override.
 */
export async function patchTelnyxCredentialConnection(params: {
  apiKey: string;
  connectionId: string;
  outboundVoiceProfileId?: string;
  anchorsiteOverride?: string;
  /** Power Dialer: `internal` lader vores egen Call Control-app ringe sælgerens WebRTC op via SIP-URI. */
  sipUriCallingPreference?: "disabled" | "internal" | "unrestricted";
}): Promise<TelnyxPatchResult> {
  const body: Record<string, unknown> = {};
  if (params.outboundVoiceProfileId) {
    body.outbound = { outbound_voice_profile_id: params.outboundVoiceProfileId };
  }
  if (params.anchorsiteOverride) {
    body.anchorsite_override = params.anchorsiteOverride;
  }
  if (params.sipUriCallingPreference) {
    body.sip_uri_calling_preference = params.sipUriCallingPreference;
  }
  if (Object.keys(body).length === 0) {
    return { ok: true, raw: null };
  }
  try {
    const res = await fetch(
      `${TELNYX_API_BASE}/credential_connections/${encodeURIComponent(params.connectionId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const rawText = await res.text().catch(() => "");
    let json: unknown = null;
    if (rawText && rawText.trim().startsWith("{")) {
      try {
        json = JSON.parse(rawText);
      } catch {
        json = null;
      }
    }
    if (!res.ok) {
      const detail = formatTelnyxError(json);
      const snippet = rawText.length > 400 ? `${rawText.slice(0, 400)}…` : rawText;
      return {
        ok: false,
        status: res.status,
        message:
          detail ||
          (snippet && !snippet.trim().startsWith("<")
            ? `Telnyx HTTP ${res.status} — ${snippet.trim()}`
            : `Telnyx HTTP ${res.status}`),
        telnyx: json ?? rawText,
      };
    }
    return { ok: true, raw: json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message:
        err instanceof Error
          ? err.message
          : "Ukendt fejl ved patch af credential connection.",
    };
  }
}

export type TelnyxCreateCredentialConnectionResult =
  | { ok: true; connection: TelnyxCredentialConnection; raw: unknown }
  | { ok: false; status: number; message: string; telnyx?: unknown };

function randomToken(len: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** POST /v2/credential_connections - opretter en Credential Connection til SIP/WebRTC. */
export async function createTelnyxCredentialConnection(params: {
  apiKey: string;
  name: string;
  userName?: string;
  password?: string;
  tag?: string;
  outboundVoiceProfileId?: string;
}): Promise<TelnyxCreateCredentialConnectionResult> {
  // Telnyx kræver at connection_name og user_name kun indeholder bogstaver og tal
  // (ingen bindestreger, mellemrum, punktum eller specialtegn).
  const sanitize = (s: string) => s.replace(/[^A-Za-z0-9]/g, "");
  const safeName = sanitize(params.name) || `allioleadswebrtc${randomToken(4)}`;
  const userName =
    sanitize(params.userName || "") || `allio${randomToken(8).toLowerCase()}`;
  const password = params.password?.trim() || randomToken(32);
  // "Frankfurt, Germany" passer til DK-brug og matcher allio-powerdialer Voice API App.
  const body: Record<string, unknown> = {
    active: true,
    connection_name: safeName,
    user_name: userName,
    password,
    anchorsite_override: "Frankfurt, Germany",
    // Power Dialer ringer sælgerens WebRTC op via sip:gencred…@sip.telnyx.com — kræver SIP URI-opkald.
    sip_uri_calling_preference: "internal",
  };
  if (params.tag) body.tags = [sanitize(params.tag)];
  if (params.outboundVoiceProfileId) {
    body.outbound = { outbound_voice_profile_id: params.outboundVoiceProfileId };
  }

  try {
    const res = await fetch(`${TELNYX_API_BASE}/credential_connections`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const rawText = await res.text().catch(() => "");
    let json: unknown = null;
    if (rawText && rawText.trim().startsWith("{")) {
      try {
        json = JSON.parse(rawText);
      } catch {
        json = null;
      }
    }
    if (!res.ok) {
      const detail = formatTelnyxError(json);
      const snippet = rawText.length > 400 ? `${rawText.slice(0, 400)}…` : rawText;
      return {
        ok: false,
        status: res.status,
        message:
          detail ||
          (snippet && !snippet.trim().startsWith("<")
            ? `Telnyx HTTP ${res.status} — ${snippet.trim()}`
            : `Telnyx HTTP ${res.status}`),
        telnyx: json ?? rawText,
      };
    }
    const data =
      json && typeof json === "object" && "data" in json
        ? (json as { data: unknown }).data
        : null;
    if (!data || typeof data !== "object") {
      return {
        ok: false,
        status: 502,
        message: "Telnyx returnerede tomt svar ved oprettelse af credential connection.",
        telnyx: json,
      };
    }
    const normalized = normalizeCredentialConnection(data as Record<string, unknown>);
    if (!normalized) {
      return {
        ok: false,
        status: 502,
        message: "Telnyx returnerede uventet svar — mangler connection id.",
        telnyx: json,
      };
    }
    return { ok: true, connection: normalized, raw: json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message:
        err instanceof Error
          ? err.message
          : "Ukendt fejl ved oprettelse af credential connection.",
    };
  }
}

export type TelnyxCreateCredentialResult =
  | { ok: true; credential: TelnyxCredentialSummary; raw: unknown }
  | { ok: false; status: number; message: string; telnyx?: unknown };

/** POST /v2/telephony_credentials - opretter ny Telephony Credential. */
export async function createTelnyxTelephonyCredential(params: {
  apiKey: string;
  connectionId: string;
  name?: string;
  tag?: string;
  expiresAtIso?: string | null;
}): Promise<TelnyxCreateCredentialResult> {
  const body: Record<string, unknown> = {
    connection_id: params.connectionId,
  };
  if (params.name) body.name = params.name;
  if (params.tag) body.tag = params.tag;
  if (params.expiresAtIso) body.expires_at = params.expiresAtIso;

  try {
    const res = await fetch(`${TELNYX_API_BASE}/telephony_credentials`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: formatTelnyxError(json) || `Telnyx HTTP ${res.status}`,
        telnyx: json,
      };
    }
    const data =
      json && typeof json === "object" && "data" in json
        ? (json as { data: unknown }).data
        : null;
    if (!data || typeof data !== "object") {
      return {
        ok: false,
        status: 502,
        message: "Telnyx returnerede et tomt svar ved oprettelse af credential.",
        telnyx: json,
      };
    }
    const summary = normalizeCredentialRecord(data as Record<string, unknown>);
    if (!summary) {
      return {
        ok: false,
        status: 502,
        message: "Telnyx returnerede uventet svar — mangler credential id.",
        telnyx: json,
      };
    }
    return { ok: true, credential: summary, raw: json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Ukendt fejl ved oprettelse af credential.",
    };
  }
}

/** GET /v2/telephony_credentials/{id} til diagnostik. */
export async function getTelnyxCredentialInfo(params: {
  telephonyCredentialId: string;
  apiKey: string;
}): Promise<TelnyxCredentialInfo> {
  try {
    const res = await fetch(
      `${TELNYX_API_BASE}/telephony_credentials/${encodeURIComponent(params.telephonyCredentialId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          Accept: "application/json",
        },
      },
    );
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = formatTelnyxError(json) || `Telnyx HTTP ${res.status}`;
      return { found: false, fetchError: msg, raw: json };
    }
    const data =
      json && typeof json === "object" && "data" in json
        ? (json as { data: unknown }).data
        : null;
    const d = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    if (!d) return { found: false, fetchError: "Tomt svar fra Telnyx", raw: json };

    const toStr = (v: unknown): string | null =>
      typeof v === "string" && v.length > 0 ? v : null;
    const connectionId = connectionIdFromTelnyxCredentialData(d);
    // #region agent log
    fetch("http://localhost:7723/ingest/7a50d2a1-e6f0-436c-8453-6828c3db5e26", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c1392e" },
      body: JSON.stringify({
        sessionId: "c1392e",
        runId: "post-fix",
        hypothesisId: "F",
        location: "lib/telnyx-call-control.ts:getTelnyxCredentialInfo",
        message: "credential fields",
        data: {
          keys: Object.keys(d).filter((k) => k !== "sip_password"),
          hasResourceId: typeof d.resource_id === "string",
          resourceIsConnection:
            typeof d.resource_id === "string" && d.resource_id.startsWith("connection:"),
          parsedConn: Boolean(connectionId),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    console.warn("[dbg-c1392e] cred-fields", {
      hasResourceId: typeof d.resource_id === "string",
      parsedConn: Boolean(connectionId),
    });
    // #endregion
    return {
      found: true,
      status: toStr(d.status) ?? undefined,
      expired:
        typeof d.expired === "boolean"
          ? d.expired
          : typeof d.status === "string"
            ? d.status.toLowerCase() === "expired"
            : undefined,
      expiresAt: toStr(d.expires_at),
      connectionId,
      sipUsername: toStr(d.sip_username),
      createdAt: toStr(d.created_at),
      updatedAt: toStr(d.updated_at),
      tag: toStr(d.tag),
      raw: json,
    };
  } catch (err) {
    return {
      found: false,
      fetchError: err instanceof Error ? err.message : "Ukendt fejl ved hentning af credential.",
    };
  }
}

export async function createTelnyxWebRtcToken(params: {
  telephonyCredentialId: string;
  apiKey: string;
}): Promise<WebRtcTokenResult> {
  // Telnyx' token-endpoint: POST /v2/telephony_credentials/{id}/token
  // Intet request body. Respons er ren JWT-tekst (content-type kan være text/plain eller application/jwt).
  const res = await fetch(
    `${TELNYX_API_BASE}/telephony_credentials/${encodeURIComponent(params.telephonyCredentialId)}/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        Accept: "text/plain, application/jwt, application/json",
      },
    },
  );

  const rawText = await res.text().catch(() => "");
  let jsonBody: unknown = null;
  if (rawText && rawText.trim().startsWith("{")) {
    try {
      jsonBody = JSON.parse(rawText);
    } catch {
      jsonBody = null;
    }
  }

  if (!res.ok) {
    const fromJson = formatTelnyxError(jsonBody);
    const snippet = rawText.length > 400 ? `${rawText.slice(0, 400)}…` : rawText;
    const msg =
      fromJson ||
      (snippet && !snippet.trim().startsWith("<")
        ? `Telnyx HTTP ${res.status} — ${snippet.trim()}`
        : `Telnyx HTTP ${res.status}`);
    if (typeof console !== "undefined") {
      console.error("[telnyx:webrtc-token] HTTP", res.status, rawText);
    }
    return {
      ok: false,
      status: res.status,
      message: msg,
      telnyx: jsonBody ?? rawText,
    };
  }

  // Forsøg 1: JSON med data.{token|login_token|jwt}
  if (jsonBody && typeof jsonBody === "object") {
    const data = (jsonBody as { data?: unknown }).data;
    const d = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    const tokenRaw = d?.token ?? d?.login_token ?? d?.jwt;
    const token =
      typeof tokenRaw === "string"
        ? tokenRaw.trim()
        : typeof tokenRaw === "number"
          ? String(tokenRaw)
          : "";
    if (token) return { ok: true, token, raw: jsonBody };
  }

  // Forsøg 2: ren JWT-tekst
  const candidate = rawText.trim();
  if (candidate && /^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/.test(candidate)) {
    return { ok: true, token: candidate, raw: candidate };
  }
  // Forsøg 3: anden tekstform — returner hvis ikke tom og ikke HTML
  if (candidate && !candidate.startsWith("<") && candidate.length < 4096) {
    return { ok: true, token: candidate, raw: candidate };
  }

  return {
    ok: false,
    status: 502,
    message: "Uventet svar fra Telnyx (mangler WebRTC token).",
    telnyx: jsonBody ?? rawText,
  };
}

/**
 * Konfiguration til AMD (Answering Machine Detection) på Telnyx Call Control.
 * Faktureres pr. minut når aktiv.
 *
 * - "premium" → mest præcis. Fyrer `call.machine.premium.detection.ended` med
 *   result ∈ {human_residence, human_business, machine, silence, fax_detected, not_sure}.
 *   Anbefales til Predictive Dialer hvor vi vil minimere abandons.
 * - "detect"  → standard AMD. Fyrer `call.machine.detection.ended` med
 *   result ∈ {human, machine, not_sure}. Hurtigere, billigere, mindre præcis.
 * - "detect_beep" / "detect_words" / "greeting_end" → varianter der venter på
 *   greeting/beep. Bruges hvis vi vil afspille en besked til voicemail.
 *
 * Vores dispatcher bruger "premium" som default for bedst kvalitet.
 */
export type AmdMode =
  | "off"
  | "premium"
  | "detect"
  | "detect_beep"
  | "detect_words"
  | "greeting_end";

export type AmdConfig = {
  mode?: AmdMode;
  /// Maks tid (ms) AMD må analysere (default 3500)
  totalAnalysisTimeMs?: number;
  /// Hvor lang tid (ms) der ventes på stilhed efter greeting før AMD afslutter (default 800)
  afterGreetingSilenceMs?: number;
  /// Hvor langt et menneske-greeting forventes maks at være (default 3500)
  greetingTotalAnalysisTimeMs?: number;
};

export async function dialTelnyxOutbound(params: {
  connectionId: string;
  from: string;
  to: string;
  apiKey: string;
  clientState?: string;
  webhookUrl?: string;
  /// AMD-konfig. Aktivér med `mode: "premium"` for at få call.machine.detection.ended events.
  amd?: AmdConfig;
  /// Maks ringe-tid (sek) før Telnyx selv hangup'er. Default Telnyx er 30 sek.
  timeoutSecs?: number;
  /// false: ringetiden er en hård grænse (ingen alternative ruter efter timeout_secs; hangup_cause no_answer).
  retryOnTimeout?: boolean;
  /// Maks. varighed af benet efter svar (sek). Default Telnyx er 4 timer.
  timeLimitSecs?: number;
  /// Del call session med et eksisterende opkald. Bridger IKKE af sig selv — se `bridgeOnAnswer`.
  linkTo?: string;
  /// Hensigt om at bridge med `linkTo` (Telnyx overskriver `from` med det linkede opkalds from).
  bridgeIntent?: boolean;
  /// Bridge automatisk med `linkTo`, når dette opkald besvares.
  bridgeOnAnswer?: boolean;
  /// Læg på i stedet for at bridge, hvis `linkTo` allerede er bridget.
  preventDoubleBridge?: boolean;
  /// Telnyx ignorerer dial-kommandoer med samme command_id (idempotens ved dobbelte webhooks).
  commandId?: string;
  /**
   * Supervising Leg: tilføj dette nye ben som supervisor på et eksisterende opkald
   * (uden conference). Se Telnyx Dial `supervise_call_control_id`.
   */
  superviseCallControlId?: string;
  /** `monitor` = stille medlyt; `whisper` / `barge` til senere. */
  supervisorRole?: "monitor" | "whisper" | "barge";
}): Promise<DialResult> {
  const from = resolveOutboundCallFromField(params.from);
  const to = resolveOutboundCallToField(params.to);
  const payload: Record<string, unknown> = {
    connection_id: params.connectionId,
    from,
    to,
  };
  if (params.clientState) payload.client_state = params.clientState;
  if (params.webhookUrl) payload.webhook_url = params.webhookUrl;
  if (params.linkTo) payload.link_to = params.linkTo;
  if (params.bridgeIntent) payload.bridge_intent = true;
  if (params.bridgeOnAnswer) payload.bridge_on_answer = true;
  if (params.preventDoubleBridge) payload.prevent_double_bridge = true;
  if (params.commandId) payload.command_id = params.commandId;
  if (params.superviseCallControlId) {
    payload.supervise_call_control_id = params.superviseCallControlId;
    payload.supervisor_role = params.supervisorRole ?? "monitor";
  }
  if (typeof params.timeoutSecs === "number") payload.timeout_secs = params.timeoutSecs;
  if (typeof params.retryOnTimeout === "boolean") payload.retry_on_timeout = params.retryOnTimeout;
  if (typeof params.timeLimitSecs === "number") payload.time_limit_secs = params.timeLimitSecs;

  const amdMode: AmdMode = params.amd?.mode ?? "off";
  if (amdMode !== "off") {
    payload.answering_machine_detection = amdMode;
    const cfg: Record<string, unknown> = {};
    if (typeof params.amd?.totalAnalysisTimeMs === "number") {
      cfg.total_analysis_time_millis = params.amd.totalAnalysisTimeMs;
    }
    if (typeof params.amd?.afterGreetingSilenceMs === "number") {
      cfg.after_greeting_silence_millis = params.amd.afterGreetingSilenceMs;
    }
    if (typeof params.amd?.greetingTotalAnalysisTimeMs === "number") {
      cfg.greeting_total_analysis_time_millis = params.amd.greetingTotalAnalysisTimeMs;
    }
    if (Object.keys(cfg).length > 0) {
      payload.answering_machine_detection_config = cfg;
    }
  }

  const res = await fetch(`${TELNYX_API_BASE}/calls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = formatTelnyxError(json) || `Telnyx HTTP ${res.status}`;
    return { ok: false, status: res.status, message: msg, telnyx: json };
  }

  const data =
    json && typeof json === "object" && "data" in json
      ? (json as { data: unknown }).data
      : null;
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const ccRaw = d?.call_control_id;
  const callControlId =
    typeof ccRaw === "string" ? ccRaw : typeof ccRaw === "number" ? String(ccRaw) : null;

  if (!callControlId) {
    return {
      ok: false,
      status: 502,
      message: "Uventet svar fra Telnyx (mangler call_control_id).",
      telnyx: json,
    };
  }

  const sessRaw = d?.call_session_id;
  const callSessionId =
    typeof sessRaw === "string" ? sessRaw : typeof sessRaw === "number" ? String(sessRaw) : undefined;

  return { ok: true, callControlId, callSessionId, raw: json };
}

export type ActionResult =
  | { ok: true; raw: unknown }
  | { ok: false; status: number; message: string; telnyx?: unknown };

/**
 * Bridge to igangværende call_control_id'er sammen. Begge legs skal være "answered".
 * Telnyx blander audio'en så de to parter taler sammen.
 *
 * Brug: bridgeTelnyxCalls({ apiKey, fromCallControlId: leadCallId, toCallControlId: agentCallId })
 */
export async function bridgeTelnyxCalls(params: {
  apiKey: string;
  fromCallControlId: string;
  toCallControlId: string;
  /// Hvis sat: park leg'en automatisk når den anden lægger på (i stedet for at hangup begge).
  /// "self" = denne leg parkes, "opposite" = den anden parkes, "both" = begge parkes.
  parkAfterUnbridge?: "self" | "opposite" | "both";
}): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    call_control_id: params.toCallControlId,
  };
  if (params.parkAfterUnbridge) body.park_after_unbridge = params.parkAfterUnbridge;

  try {
    const res = await fetch(
      `${TELNYX_API_BASE}/calls/${encodeURIComponent(params.fromCallControlId)}/actions/bridge`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: formatTelnyxError(json) || `Telnyx HTTP ${res.status}`,
        telnyx: json,
      };
    }
    return { ok: true, raw: json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Ukendt fejl ved bridge.",
    };
  }
}

/**
 * Hangup et aktivt opkald. Bruges fx når AMD detekterer voicemail og vi vil afbryde.
 */
export async function hangupTelnyxCall(params: {
  apiKey: string;
  callControlId: string;
  clientState?: string;
  commandId?: string;
}): Promise<ActionResult> {
  const body: Record<string, unknown> = {};
  if (params.clientState) body.client_state = params.clientState;
  if (params.commandId) body.command_id = params.commandId;

  try {
    const res = await fetch(
      `${TELNYX_API_BASE}/calls/${encodeURIComponent(params.callControlId)}/actions/hangup`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (res.status === 422) {
      // Allerede lagt på — ikke en fejl for vores formål
      return { ok: true, raw: null };
    }
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: formatTelnyxError(json) || `Telnyx HTTP ${res.status}`,
        telnyx: json,
      };
    }
    return { ok: true, raw: json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Ukendt fejl ved hangup.",
    };
  }
}

/**
 * Læg et besvaret Call Control-ben på hold (Twilio-lignende park mens vi finder sælger).
 */
export async function holdTelnyxCall(params: {
  apiKey: string;
  callControlId: string;
  commandId?: string;
}): Promise<ActionResult> {
  const body: Record<string, unknown> = {};
  if (params.commandId) body.command_id = params.commandId;
  try {
    const res = await fetch(
      `${TELNYX_API_BASE}/calls/${encodeURIComponent(params.callControlId)}/actions/hold`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (res.status === 422) return { ok: true, raw: null };
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: formatTelnyxError(json) || `Telnyx HTTP ${res.status}`,
        telnyx: json,
      };
    }
    return { ok: true, raw: json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Ukendt fejl ved hold.",
    };
  }
}

/** Tag et Call Control-ben af hold før bridge til sælger. */
export async function unholdTelnyxCall(params: {
  apiKey: string;
  callControlId: string;
  commandId?: string;
}): Promise<ActionResult> {
  const body: Record<string, unknown> = {};
  if (params.commandId) body.command_id = params.commandId;
  try {
    const res = await fetch(
      `${TELNYX_API_BASE}/calls/${encodeURIComponent(params.callControlId)}/actions/unhold`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (res.status === 422) return { ok: true, raw: null };
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: formatTelnyxError(json) || `Telnyx HTTP ${res.status}`,
        telnyx: json,
      };
    }
    return { ok: true, raw: json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Ukendt fejl ved unhold.",
    };
  }
}

/** Kort TTS til kunden mens Power Dialer finder en sælger. */
export async function speakTelnyxCall(params: {
  apiKey: string;
  callControlId: string;
  payload: string;
  language?: string;
  voice?: string;
  commandId?: string;
}): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    payload: params.payload,
    language: params.language ?? "da-DK",
    voice: params.voice ?? "female",
  };
  if (params.commandId) body.command_id = params.commandId;
  try {
    const res = await fetch(
      `${TELNYX_API_BASE}/calls/${encodeURIComponent(params.callControlId)}/actions/speak`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (res.status === 422) return { ok: true, raw: null };
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: formatTelnyxError(json) || `Telnyx HTTP ${res.status}`,
        telnyx: json,
      };
    }
    return { ok: true, raw: json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Ukendt fejl ved speak.",
    };
  }
}

/**
 * Svar et indkommende opkald på Telnyx call control siden (svarer typisk programmatisk
 * fra webhook efter call.initiated på inbound). Sjældent brugt fra Allio direkte —
 * agenter besvarer via deres WebRTC-klient.
 */
export async function answerTelnyxCall(params: {
  apiKey: string;
  callControlId: string;
  clientState?: string;
}): Promise<ActionResult> {
  const body: Record<string, unknown> = {};
  if (params.clientState) body.client_state = params.clientState;

  try {
    const res = await fetch(
      `${TELNYX_API_BASE}/calls/${encodeURIComponent(params.callControlId)}/actions/answer`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: formatTelnyxError(json) || `Telnyx HTTP ${res.status}`,
        telnyx: json,
      };
    }
    return { ok: true, raw: json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Ukendt fejl ved answer.",
    };
  }
}

/**
 * Bygger SIP-URI for en Telnyx Telephony Credential / Credential Connection username.
 * Telnyx ringer denne URI op via deres SIP-edge → agentens WebRTC-klient (hvis registreret).
 */
export function buildTelnyxAgentSipUri(sipUsername: string): string {
  return `sip:${sipUsername}@sip.telnyx.com`;
}

/**
 * Skal appen selv starte optagelser (record_start)? Som standard nej: Telnyx' outbound voice profile
 * ("Default") optager ALLE opkald i stereo (dual, siden 26/9-2026) — også power dialerens — så
 * app-optagelser gav dubletter. Den ældre dispatcher startede desuden sin optagelse, før sælgeren
 * var forbundet, så den ene kanal blev tavs. Slå til med TELNYX_APP_RECORDING=on.
 */
export function appRecordingEnabled(): boolean {
  return process.env.TELNYX_APP_RECORDING?.trim().toLowerCase() === "on";
}

/**
 * Start optagelse af et igangværende opkald.
 *
 * - `format: "mp3"` for kompakt lydfil egnet til afspilning i browseren.
 * - `channels: "dual"` lægger hver leg på sin egen kanal (agent = venstre, lead = højre)
 *   så vi senere kan analysere hvem der talte hvornår — ideelt til træning.
 * - `play_beep: false` undgår at afspille en beep-tone til parten.
 *
 * Telnyx fyrer `call.recording.saved` når optagelsen er klar (typisk få sek efter hangup).
 * Vi henter URL'en derfra og kobler den til lead-aktiviteten.
 */
export async function startTelnyxRecording(params: {
  apiKey: string;
  callControlId: string;
  format?: "mp3" | "wav";
  channels?: "single" | "dual";
  /// Brug client_state til at sende kontekst med — fx hvilken agent der talte med leadet.
  clientState?: string;
  commandId?: string;
}): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    format: params.format ?? "mp3",
    channels: params.channels ?? "dual",
    play_beep: false,
  };
  if (params.clientState) body.client_state = params.clientState;
  if (params.commandId) body.command_id = params.commandId;

  try {
    const res = await fetch(
      `${TELNYX_API_BASE}/calls/${encodeURIComponent(params.callControlId)}/actions/record_start`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    // 422: optagelse kører allerede / kald lagt på — ikke en fejl for vores formål.
    if (res.status === 422) {
      return { ok: true, raw: null };
    }
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: formatTelnyxError(json) || `Telnyx HTTP ${res.status}`,
        telnyx: json,
      };
    }
    return { ok: true, raw: json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Ukendt fejl ved start af recording.",
    };
  }
}

/**
 * Start realtids-transskription på et besvaret ben. Telnyx sender `call.transcription`
 * (Soniox stt-rt via Telnyx — ingen inbound WebSocket på Vercel).
 */
export async function startTelnyxCallTranscription(params: {
  apiKey: string;
  callControlId: string;
  commandId?: string;
  timeoutMs?: number;
}): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    transcription_engine: "Soniox",
    transcription_tracks: "inbound",
    transcription_engine_config: {
      transcription_engine: "Soniox",
      transcription_model: "soniox/stt-rt-v4",
      language: "da",
      interim_results: true,
      enable_endpoint_detection: true,
      max_endpoint_delay_ms: 500,
    },
  };
  if (params.commandId) body.command_id = params.commandId;

  try {
    const res = await fetchWithTimeout(
      `${TELNYX_API_BASE}/calls/${encodeURIComponent(params.callControlId)}/actions/transcription_start`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      },
      params.timeoutMs ?? 2500,
    );
    const json: unknown = await res.json().catch(() => null);
    if (res.status === 422) {
      const message = formatTelnyxError(json) || "";
      if (isPowerSonioxUnavailableError(422, message)) {
        return { ok: false, status: 422, message, telnyx: json };
      }
      return { ok: true, raw: json };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: formatTelnyxError(json) || `Telnyx HTTP ${res.status}`,
        telnyx: json,
      };
    }
    return { ok: true, raw: json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Ukendt fejl ved start af transskription.",
    };
  }
}

/** Stop realtids-transskription (422 = allerede stoppet / aldrig startet). */
export async function stopTelnyxCallTranscription(params: {
  apiKey: string;
  callControlId: string;
  commandId?: string;
  timeoutMs?: number;
}): Promise<ActionResult> {
  const body: Record<string, unknown> = {};
  if (params.commandId) body.command_id = params.commandId;
  try {
    const res = await fetchWithTimeout(
      `${TELNYX_API_BASE}/calls/${encodeURIComponent(params.callControlId)}/actions/transcription_stop`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      },
      params.timeoutMs ?? 1500,
    );
    if (res.status === 422) return { ok: true, raw: null };
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: formatTelnyxError(json) || `Telnyx HTTP ${res.status}`,
        telnyx: json,
      };
    }
    return { ok: true, raw: json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Ukendt fejl ved stop af transskription.",
    };
  }
}

/**
 * GET /v2/call_control_applications/{id} — udgående kanalgrænse for appen (null = ingen grænse sat).
 * Power Dialer bruger den som loft for samtidige lead-opkald på tværs af kampagner.
 */
export async function getTelnyxCallControlOutboundChannelLimit(params: {
  apiKey: string;
  applicationId: string;
}): Promise<{ ok: true; channelLimit: number | null } | { ok: false; message: string }> {
  try {
    const res = await fetch(
      `${TELNYX_API_BASE}/call_control_applications/${encodeURIComponent(params.applicationId)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${params.apiKey}`, Accept: "application/json" },
      },
    );
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, message: formatTelnyxError(json) || `Telnyx HTTP ${res.status}` };
    }
    const data =
      json && typeof json === "object" && "data" in json
        ? ((json as { data: unknown }).data as Record<string, unknown> | null)
        : null;
    const outbound =
      data && typeof data.outbound === "object" && data.outbound
        ? (data.outbound as Record<string, unknown>)
        : null;
    const raw = outbound?.channel_limit;
    const channelLimit = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
    return { ok: true, channelLimit };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Ukendt fejl ved hentning af app." };
  }
}
