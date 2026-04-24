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
