/**
 * Fast, deterministic greeting classifier for Power Dialer.
 * Only confident Danish/English voicemail vs live-human phrases count —
 * everything else is uncertain and must be sent to a seller.
 */

export type GreetingHint = "human" | "voicemail" | "uncertain";

function fold(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9æøåäöü\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clear answering-machine / voicemail language. Must not fire on a live «hallo». */
const VOICEMAIL_RE = [
  /\bvoicemail\b/,
  /\btelefonsvarer\b/,
  /\bafter (the )?tone\b/,
  /\bleave (a |your )?message\b/,
  /\bplease leave\b/,
  /\bnot available\b/,
  /\bthis is the (voicemail|mailbox|answering)\b/,
  /\bdu har (ramt|traffer|traffet|naet)\b/,
  /\bhar pr[oø]ve[dt] at ringe\b/,
  /\bpr[oø]vede? at ringe\b/,
  /\befter (tonen|bippet|biplyden|signalet|klartonen)\b/,
  /\binden (tonen|bippet|biplyden)\b/,
  /\bl[ae]g(ge)? (venligst |en )?(besked|meddelelse)\b/,
  /\bikke (tilgængelig|tilgængelige|tilstede|til stede|ved telefonen|hjemme lige nu)\b/,
  /\bkan ikke (tage|besvare) (telefonen|opkaldet)\b/,
  /\bvender (hurtigst )?tilbage\b/,
  /\bring(er)? (dig |jer )?tilbage\b/,
  /\ber optaget\b/,
  /\bmailbox\b/,
  /\banswering machine\b/,
];

/** Short live-answer language. Keep tight so voicemail intros do not match. */
const HUMAN_RE = [
  /^(hallo|halloj|halløj)\b/,
  /\b(hallo|halloj|halløj)[\s.?!]*(det er|her er|her|hvem)\b/,
  /\bhej det er\b/,
  /\bdet er [a-zæøå]{2,}\b/,
  /\bher er [a-zæøå]{2,}\b/,
  /\bhvem (er det|taler|ringer)\b/,
  /\bhvad drejer\b/,
  /\bgoddag\b/,
  /\bthis is [a-z]{2,}\b/,
  /\bspeaking\b/,
];

/** Below this, a voicemail phrase is not trusted — send to a seller instead. */
const VOICEMAIL_MIN_CONFIDENCE = 0.65;

export function classifyPowerGreeting(raw: string, confidence?: number | null): GreetingHint {
  const t = fold(raw);
  if (t.length < 2) return "uncertain";
  if (VOICEMAIL_RE.some((re) => re.test(t))) {
    if (typeof confidence === "number" && confidence < VOICEMAIL_MIN_CONFIDENCE) return "uncertain";
    return "voicemail";
  }
  if (HUMAN_RE.some((re) => re.test(t))) return "human";
  return "uncertain";
}

export function mergeGreetingHint(current: GreetingHint | null, next: GreetingHint): GreetingHint {
  if (next === "uncertain") return current ?? "uncertain";
  if (current === "human" || next === "human") return "human";
  return next;
}

export function extractTelnyxTranscriptText(payload: Record<string, unknown>): string {
  const data = transcriptionData(payload);
  for (const key of ["transcript", "text", "transcription"] as const) {
    const v = data[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (typeof payload.transcript === "string" && payload.transcript.trim()) return payload.transcript.trim();
  return "";
}

export function extractTelnyxTranscriptConfidence(payload: Record<string, unknown>): number | null {
  const n = transcriptionData(payload).confidence;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function transcriptionData(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.transcription_data && typeof payload.transcription_data === "object") {
    return payload.transcription_data as Record<string, unknown>;
  }
  if (payload.transcription && typeof payload.transcription === "object") {
    return payload.transcription as Record<string, unknown>;
  }
  return payload;
}
