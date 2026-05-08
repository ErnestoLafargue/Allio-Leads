import { NextResponse } from "next/server";

/**
 * POST /api/telnyx/predictive-call/start (deprecated)
 *
 * Tidligere: server-side Call Control + AMD til predictive. Predictive bruger nu
 * samme WebRTC-sti som Power (`/api/telnyx/manual-call/prepare` + `client.newCall`).
 * Endpointet bevares med 410 så gamle builds fejler tydeligt.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "predictive-call/start er fjernet — Predictive bruger WebRTC som Power (manual-call/prepare + newCall). Opdater klient.",
      code: "PREDICTIVE_WEBRTC_ONLY",
    },
    { status: 410 },
  );
}

export const runtime = "nodejs";
