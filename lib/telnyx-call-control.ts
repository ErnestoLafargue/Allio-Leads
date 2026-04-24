import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";

const TELNYX_API_BASE = "https://api.telnyx.com/v2";

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
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Vælger afsender (ét af jeres Telnyx-numre). Flere numre: kommasepareret i TELNYX_FROM_NUMBERS;
 * fordeling efter leadId så samme lead typisk får samme linje.
 */
export function pickTelnyxFromNumber(leadId: string): string | null {
  const list = parseFromNumbersList();
  const normalized = list
    .map((n) => normalizePhoneToE164ForDial(n))
    .filter((n): n is string => Boolean(n));
  if (normalized.length > 0) {
    let h = 0;
    for (let i = 0; i < leadId.length; i++) {
      h = (h * 31 + leadId.charCodeAt(i)) | 0;
    }
    return normalized[Math.abs(h) % normalized.length] ?? null;
  }
  const single = process.env.TELNYX_FROM_NUMBER?.trim();
  if (!single) return null;
  return normalizePhoneToE164ForDial(single) ?? null;
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
};

function normalizeCredentialRecord(d: Record<string, unknown>): TelnyxCredentialSummary | null {
  const toStr = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;
  const id = toStr(d.id);
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
    connectionId: toStr(d.connection_id),
    tag: toStr(d.tag),
    createdAt: toStr(d.created_at),
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
}): Promise<TelnyxCreateCredentialConnectionResult> {
  // Telnyx kræver at connection_name og user_name kun indeholder bogstaver og tal
  // (ingen bindestreger, mellemrum, punktum eller specialtegn).
  const sanitize = (s: string) => s.replace(/[^A-Za-z0-9]/g, "");
  const safeName = sanitize(params.name) || `allioleadswebrtc${randomToken(4)}`;
  const userName =
    sanitize(params.userName || "") || `allio${randomToken(8).toLowerCase()}`;
  const password = params.password?.trim() || randomToken(32);
  const body: Record<string, unknown> = {
    active: true,
    connection_name: safeName,
    user_name: userName,
    password,
    anchorsite_override: "Latency",
  };
  if (params.tag) body.tags = [sanitize(params.tag)];

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
      connectionId: toStr(d.connection_id),
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

export async function dialTelnyxOutbound(params: {
  connectionId: string;
  from: string;
  to: string;
  apiKey: string;
  clientState?: string;
  webhookUrl?: string;
}): Promise<DialResult> {
  const payload: Record<string, unknown> = {
    connection_id: params.connectionId,
    from: params.from,
    to: params.to,
  };
  if (params.clientState) payload.client_state = params.clientState;
  if (params.webhookUrl) payload.webhook_url = params.webhookUrl;

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
