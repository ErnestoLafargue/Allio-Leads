const TELNYX_API_BASE = "https://api.telnyx.com/v2";

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

export async function sendTelnyxSms(params: {
  apiKey: string;
  from: string;
  to: string;
  text: string;
}): Promise<{ ok: true; id: string; raw: unknown } | { ok: false; status: number; message: string; raw?: unknown }> {
  const res = await fetch(`${TELNYX_API_BASE}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      text: params.text,
      type: "SMS",
    }),
  });

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: formatTelnyxError(json) || `Telnyx HTTP ${res.status}`,
      raw: json,
    };
  }

  const data =
    json && typeof json === "object" && "data" in json ? (json as { data: unknown }).data : null;
  const idRaw = data && typeof data === "object" ? (data as { id?: unknown }).id : null;
  const id = typeof idRaw === "string" ? idRaw : "";
  if (!id) {
    return { ok: false, status: 502, message: "Telnyx returnerede ikke message-id.", raw: json };
  }
  return { ok: true, id, raw: json };
}

