import { NextResponse } from "next/server";
import { POST as handleCallEvent } from "@/app/api/telnyx/webhooks/call-events/route";

/**
 * Failover-webhook for Telnyx Call Control-apps. Telnyx sender hertil efter to fejlede leveringer
 * til den primære URL — samme idempotente håndtering, så events ikke går tabt.
 */
export async function POST(req: Request) {
  return handleCallEvent(req);
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "telnyx-voice-webhook-failover" });
}

export const runtime = "nodejs";
export const maxDuration = 60;
