/**
 * Mapper Telnyx Premium AMD `result`-værdier til vores 4 interne kategorier.
 *
 * Telnyx returnerer forskellige værdier afhængigt af AMD-mode:
 *   - detect:           human | machine | not_sure
 *   - premium:          human_residence | human_business | machine | silence | fax_detected | not_sure
 *   - greeting/beep:    ended | beep_detected | no_beep_detected | not_sure
 *
 * Vi mapper alle varianter til 4 interne kategorier:
 *   - "human"   → bridge til agent
 *   - "machine" → hangup + marker som VOICEMAIL
 *   - "fax"     → hangup + marker som VOICEMAIL (faxmaskine = ikke et menneske)
 *   - "unknown" → Predictive: bridge til agent. Power Dialer: requeue + cooldown (ingen bridge).
 *
 * Bruges af [`app/api/telnyx/webhooks/call-events/route.ts`](app/api/telnyx/webhooks/call-events/route.ts).
 */
export type AmdInternalResult = "human" | "machine" | "fax" | "unknown";

export function mapTelnyxAmdResult(rawResult: string | null | undefined): AmdInternalResult {
  const result = String(rawResult ?? "").trim().toLowerCase();
  switch (result) {
    case "human":
    case "human_residence":
    case "human_business":
      return "human";
    case "machine":
      return "machine";
    case "fax":
    case "fax_detected":
      return "fax";
    case "beep_detected":
    case "no_beep_detected":
    case "ended":
      // Greeting-events fyrer KUN når AMD allerede har konkluderet machine.
      // Vi behandler dem som "machine" så vi ikke bridger til en VM.
      return "machine";
    default:
      // silence | not_sure | uventet — usikker resultat → bridge alligevel
      // (false negatives koster en agent 1-2 sek; false positives mister leads).
      return "unknown";
  }
}

/**
 * Skal vi udløse handleAmdMachine (sætte lead.status = VOICEMAIL)?
 * Både "machine" og "fax" tæller — fax ≠ menneske.
 */
export function shouldMarkVoicemail(amd: AmdInternalResult): boolean {
  return amd === "machine" || amd === "fax";
}

/**
 * Skal vi udløse handleAmdHuman (bridge til agent)?
 * Både "human" og "unknown" — vi bridger ved usikkerhed for ikke at miste leads.
 */
export function shouldBridgeToAgent(amd: AmdInternalResult): boolean {
  return amd === "human" || amd === "unknown";
}

/** Power Dialer: tydelig maskine/fax (samme som VOICEMAIL-gren i dag). */
export function isPowerDialerDefiniteVoicemail(amd: AmdInternalResult): boolean {
  return shouldMarkVoicemail(amd);
}

/** Power Dialer: usikker AMD — ikke bridge; requeue + cooldown i stedet. */
export function isPowerDialerUncertain(amd: AmdInternalResult): boolean {
  return amd === "unknown";
}
