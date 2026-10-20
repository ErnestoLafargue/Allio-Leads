/**
 * Klient-side ICE-parse (samme format som serverens MedlytIceCandidate).
 * Holdes ude af server-modulet så browser-bundlen ikke trækker prisma ind.
 */

export type MedlytIceCandidate = {
  candidate?: string | null;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

export function postMedlytClientDebug(
  listenSessionId: string | null,
  payload: {
    hypothesisId: string;
    location: string;
    message: string;
    data?: Record<string, unknown>;
  },
): void {
  fetch("http://localhost:7723/ingest/7a50d2a1-e6f0-436c-8453-6828c3db5e26", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c1392e" },
    body: JSON.stringify({
      sessionId: "c1392e",
      hypothesisId: payload.hypothesisId,
      location: payload.location,
      message: payload.message,
      data: payload.data ?? {},
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  if (!listenSessionId) return;
  fetch(`/api/dialer/medlyt/listen/${listenSessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientDebug: payload }),
  }).catch(() => {});
}

export function iceCandidatesFromJson(json: string | null | undefined): MedlytIceCandidate[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as MedlytIceCandidate[]) : [];
  } catch {
    return [];
  }
}
