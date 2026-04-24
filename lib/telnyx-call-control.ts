import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";

const TELNYX_API_BASE = "https://api.telnyx.com/v2";

/** Call Control application id (portal kalder det ofte Application ID). */
export function getTelnyxConnectionId(): string | null {
  const c =
    process.env.TELNYX_CONNECTION_ID?.trim() || process.env.TELNYX_APPLICATION_ID?.trim();
  return c || null;
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
