/**
 * Combine Telnyx AMD and Soniox greeting. Uncertain systems always connect a seller.
 */

import type { AmdInternalResult } from "@/lib/telnyx-amd-result";
import type { GreetingHint } from "@/lib/power-greeting-classify";

export type PowerGreetingAction = "CONNECT" | "VOICEMAIL" | "WAIT";

export type PowerGreetingSignals = {
  /** Telnyx AMD, or null if it has not finished. */
  amd: AmdInternalResult | null;
  /** Soniox phrase hint, or null if no confident/any text yet. */
  greeting: GreetingHint | null;
  /** Grace period is over — must pick CONNECT or VOICEMAIL. */
  timedOut: boolean;
  /**
   * Soniox transcription is running on this leg. When false (no credits, start
   * failed, or skipped), AMD decides immediately — Power Dialer must still work.
   */
  sonioxListening?: boolean;
};

/**
 * Fast human from Soniox or AMD → seller.
 * Confident voicemail (Soniox phrase, or AMD machine after grace) → hang up.
 * Anything unclear → WAIT until timeout, then CONNECT.
 */
export function decidePowerGreetingAction(input: PowerGreetingSignals): PowerGreetingAction {
  const { amd, greeting, timedOut } = input;
  const sonioxListening = input.sonioxListening !== false;

  if (greeting === "human") return "CONNECT";
  if (greeting === "voicemail") {
    // AMD said human but Soniox said voicemail — systems disagree → seller.
    if (amd === "human") return "CONNECT";
    return "VOICEMAIL";
  }

  if (amd === "human") return "CONNECT";

  if (amd === "machine" || amd === "fax") {
    if (sonioxListening && !timedOut) return "WAIT";
    return "VOICEMAIL";
  }

  if (!timedOut) return "WAIT";
  return "CONNECT";
}
