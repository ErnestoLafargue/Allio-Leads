import { NextResponse } from "next/server";

type TelnyxWebhookPayload = {
  data?: {
    event_type?: string;
    id?: string;
    occurred_at?: string;
    payload?: {
      call_control_id?: string;
      call_session_id?: string;
      from?: string;
      to?: string;
      direction?: string;
      client_state?: string;
      result?: string;
      cause?: string;
      [key: string]: unknown;
    };
  };
  [key: string]: unknown;
};

function safeJsonParse(raw: string): TelnyxWebhookPayload | null {
  try {
    return JSON.parse(raw) as TelnyxWebhookPayload;
  } catch {
    return null;
  }
}

/**
 * Failover webhook endpoint til Telnyx Voice API.
 * Samme lette håndtering som primary, men markeret som failover i log.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const body = safeJsonParse(raw);
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = String(body.data?.event_type ?? "");
  const occurredAt = String(body.data?.occurred_at ?? "");
  const callControlId = String(body.data?.payload?.call_control_id ?? "");
  const callSessionId = String(body.data?.payload?.call_session_id ?? "");
  const from = String(body.data?.payload?.from ?? "");
  const to = String(body.data?.payload?.to ?? "");
  const result = String(body.data?.payload?.result ?? "");
  const cause = String(body.data?.payload?.cause ?? "");

  console.info("[telnyx:webhook:failover]", {
    eventType,
    occurredAt,
    callControlId,
    callSessionId,
    from,
    to,
    result,
    cause,
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "telnyx-voice-webhook-failover" });
}

