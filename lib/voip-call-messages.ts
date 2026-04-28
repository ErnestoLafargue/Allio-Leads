/**
 * Dansk kort-tekst til VOIP/Verto-opkald baseret på SIP og Telnyx-felter.
 * Returnerer `null` når opkaldet ser ud til at være afsluttet normalt (efter gennemført samtale).
 */

export const VOIP_ERROR_FALLBACK = "Opkaldet kunne ikke gennemføres";

const BUSY = new Set([486, 600]);
const NO_ANSWER = new Set([408, 480, 410]);
const INVALID = new Set([404, 484]);
const NETWORK = new Set([500, 502, 503, 504]);
const REJECT = new Set([603, 606]);

const CAUSE_BUSY = /busy|user\s*busy/i;
const CAUSE_NO_ANSWER = /no\s*answer|timeout|unavailable|time-out/i;
const CAUSE_NETWORK = /network|ice|pc\s*error|disconnected|connection/i;
const CAUSE_NORMAL_END =
  /normal[\s_-]*clearing|normal call clearing|call completed|completed elsewhere|answered elsewhere/i;

export type VoipCallFailureMeta = {
  hadLive: boolean;
  sipCode: number;
  cause: string;
  sipReason: string;
};

function nonEmpty(s: string): string | null {
  const t = s.trim();
  return t ? t : null;
}

/**
 * Mappes til kort brugerbesked; `null` = ingen fejl-toast (normal afslutning / bruger lagde på uden SINK-fejl).
 */
export function describeVoipCallFailureForUi(meta: VoipCallFailureMeta): {
  userText: string;
  technical: string;
} | null {
  const { hadLive, sipCode, cause, sipReason } = meta;
  const causeNorm = nonEmpty(cause)?.toLowerCase() ?? "";
  const reasonNorm = nonEmpty(sipReason)?.toLowerCase() ?? "";
  const technical = [
    `sipCode=${Number.isFinite(sipCode) ? sipCode : "?"}`,
    cause ? `cause=${cause}` : null,
    sipReason ? `sipReason=${sipReason}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  // Nogle carriers/Telnyx returnerer NORMAL_CLEARING selv når "live"-state ikke nåede
  // frontenden. Det er en normal afslutning og skal ikke vises som fejl-toast.
  if (
    CAUSE_NORMAL_END.test(causeNorm) ||
    CAUSE_NORMAL_END.test(reasonNorm) ||
    sipCode === 200 ||
    sipCode === 202
  ) {
    return null;
  }

  if (hadLive) {
    if (NETWORK.has(sipCode) || (sipCode >= 500 && sipCode < 600)) {
      return { userText: "Ingen forbindelse", technical };
    }
    if (sipCode === 408) {
      return { userText: "Ingen svarede", technical };
    }
    if (CAUSE_NETWORK.test(cause) || CAUSE_NETWORK.test(sipReason)) {
      return { userText: "Ingen forbindelse", technical };
    }
    return null;
  }

  if (BUSY.has(sipCode) || CAUSE_BUSY.test(cause) || /busy/i.test(sipReason)) {
    return { userText: "Nummeret er optaget", technical };
  }
  if (NO_ANSWER.has(sipCode) || REJECT.has(sipCode) || CAUSE_NO_ANSWER.test(cause)) {
    if (REJECT.has(sipCode)) {
      return { userText: "Ingen svarede", technical };
    }
    return { userText: "Ingen svarede", technical };
  }
  if (INVALID.has(sipCode) || sipCode === 404) {
    return { userText: "Nummeret er forkert", technical };
  }
  if (NETWORK.has(sipCode) || (sipCode >= 500 && sipCode < 600) || CAUSE_NETWORK.test(cause)) {
    return { userText: "Ingen forbindelse", technical };
  }
  if (sipCode === 403) {
    return { userText: "Opkaldet kunne ikke gennemføres", technical };
  }
  if (sipCode === 488) {
    return { userText: "Opkaldet kunne ikke gennemføres", technical };
  }
  if (sipCode === 487) {
    return { userText: "Opkaldet blev afbrudt", technical };
  }
  if (sipCode > 0 && sipCode < 200) {
    return { userText: VOIP_ERROR_FALLBACK, technical };
  }
  if (nonEmpty(sipReason)?.toLowerCase().includes("invalid") || nonEmpty(cause)?.toLowerCase().includes("invalid")) {
    return { userText: "Ugyldigt telefonnummer", technical };
  }
  if (sipCode === 0 && !nonEmpty(cause) && !nonEmpty(sipReason)) {
    return { userText: VOIP_ERROR_FALLBACK, technical };
  }
  if (sipCode > 0) {
    return { userText: VOIP_ERROR_FALLBACK, technical };
  }
  if (nonEmpty(cause) || nonEmpty(sipReason)) {
    if (CAUSE_NO_ANSWER.test(cause) || CAUSE_NO_ANSWER.test(sipReason)) {
      return { userText: "Ingen svarede", technical };
    }
    return { userText: VOIP_ERROR_FALLBACK, technical };
  }
  return { userText: VOIP_ERROR_FALLBACK, technical };
}

/** Fejl før opkaldet er etableret (newCall, token, m.m.) */
export function describeVoipStartupFailure(err: unknown): { userText: string; technical: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes("invalid") && (lower.includes("number") || lower.includes("dest"))) {
    return { userText: "Ugyldigt telefonnummer", technical: raw };
  }
  if (lower.includes("e.164") || lower.includes("8 cifre")) {
    return { userText: "Ugyldigt telefonnummer", technical: raw };
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return { userText: "Ingen forbindelse", technical: raw };
  }
  if (lower.includes("token") && lower.includes("http")) {
    return { userText: "Ingen forbindelse (login)", technical: raw };
  }
  if (lower.includes("network") || lower.includes("ice")) {
    return { userText: "Ingen forbindelse", technical: raw };
  }
  if (raw.length < 200) {
    return { userText: "Opkaldet kunne ikke gennemføres", technical: raw };
  }
  return { userText: "Opkaldet kunne ikke gennemføres", technical: raw.slice(0, 200) + "…" };
}
