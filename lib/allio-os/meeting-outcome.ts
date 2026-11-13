import { createHmac, timingSafeEqual } from "node:crypto";
import { moveLeadToRebooking } from "@/lib/calcom/webhook-apply";
import {
  applyInProgressOutcome,
  applyLostOutcome,
  applyPendingOutcome,
  applySaleOutcome,
} from "@/lib/podio/moeder-item-update";

/** Udfaldene, Allio OS sætter på et salgsmøde. null = intet udfald (mødet afventer afholdelse). */
export type AllioOsOutcome = "salg" | "afventer" | "tabt" | "genbook" | null;

export function parseAllioOsOutcome(raw: unknown): AllioOsOutcome | undefined {
  if (raw === null) return null;
  return raw === "salg" || raw === "afventer" || raw === "tabt" || raw === "genbook" ? raw : undefined;
}

/**
 * Verificér at kaldet kommer fra Allio OS.
 * Signed message = `{timestamp}.{rawBody}`, HMAC-SHA256 med ALLIO_OS_LEADS_SECRET, header "sha256=<hex>".
 */
export function verifyAllioOsSignature(opts: {
  rawBody: string;
  timestamp: string;
  signature: string;
  secret: string;
  maxSkewSeconds?: number;
}): boolean {
  const { rawBody, timestamp, signature, secret } = opts;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || !signature || !secret) return false;
  if (Math.abs(Date.now() / 1000 - ts) > (opts.maxSkewSeconds ?? 300)) return false;

  const expected = "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Anvend udfaldet fra Allio OS på leadet — samme regler som når udfaldet kommer fra Podio:
 * salg → Vundet (Aktive kunder), afventer → Under behandling, tabt → Tabt, genbook → Genbooking-kampagnen,
 * intet udfald → Afventer afholdelse. Returnerer om leadet blev ændret.
 */
export async function applyAllioOsOutcome(leadId: string, outcome: AllioOsOutcome): Promise<boolean> {
  const source = "Allio OS";
  switch (outcome) {
    case "salg":
      return applySaleOutcome(leadId, source);
    case "afventer":
      return applyInProgressOutcome(leadId, source);
    case "tabt":
      return applyLostOutcome(leadId, source);
    case "genbook":
      return moveLeadToRebooking(leadId);
    default:
      return applyPendingOutcome(leadId, source);
  }
}
