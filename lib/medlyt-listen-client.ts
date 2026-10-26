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

export function iceCandidatesFromJson(json: string | null | undefined): MedlytIceCandidate[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as MedlytIceCandidate[]) : [];
  } catch {
    return [];
  }
}
