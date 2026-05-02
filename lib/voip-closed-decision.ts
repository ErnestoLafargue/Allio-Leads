/**
 * Beslutter hvordan en Telnyx WebRTC CLOSED-notifikation skal håndteres.
 *
 * Baggrund: SDK'en kan levere CLOSED-events for *andre* call legs end det aktuelt
 * aktive opkald (sene events fra netop hangede opkald, parallelle bridges m.m.).
 * Hvis vi blindt finalizer det aktive opkalds timer hver gang en CLOSED-notifikation
 * lander, fryser sekundtælleren mid-samtale.
 *
 * Denne pure funktion afgør om CLOSED tilhører det aktive opkald, og hvilken
 * timerKey (hvis nogen) der skal finalizes. Holdes adskilt fra komponenten så
 * den kan unit-testes uden React/SDK-mocks.
 */

export type CallIdentityRef = {
  /** Reference-identitet til opkalds-objektet (===-sammenligning). */
  callObject: unknown;
  /** Bedste tekstuelle identitet vi kan udlede (callControlId / sessionId / legId). */
  identity: string | null;
};

export type ClosedDecision = {
  /**
   * Hvis true → CLOSED tilhører det live opkald; kør hele eksisterende side-effekt-pipeline
   * (clearAudio, setLineStatus("idle"), aktivit-log, predictive autoOutcome osv.).
   * Hvis false → notifikationen er for et andet/stale opkald; spring side-effekter over
   * og rør IKKE timeren, så den live-tæller fortsætter uberørt.
   */
  isClosingActiveCall: boolean;
  /**
   * Den timerKey der skal sendes ind i `finalizeCallTimer`. `null` betyder
   * "finaliser ikke" (enten fordi vi ikke kender det lukkede call legs key, eller
   * fordi notifikationen ikke tilhører det live opkald).
   */
  closedTimerKey: string | null;
};

/**
 * @param closed     Identitet for det LUKKEDE call leg (fra notifikationens `payload.call`).
 * @param active     Identitet for det live opkald (fra `activeCallRef.current`). Kan være null.
 * @param identityToTimerKey  Map fra known call-identity → timerKey, populeret når opkald startes.
 * @param fallbackActiveTimerKey  Live opkalds timerKey (currentCallContextRef.current.timerKey ?? callKeyRef.current),
 *                                bruges KUN hvis closed-identiteten er null OG vi har reference-match.
 */
export function decideClosedNotification(
  closed: CallIdentityRef,
  active: CallIdentityRef | null,
  identityToTimerKey: ReadonlyMap<string, string>,
  fallbackActiveTimerKey: string | null,
): ClosedDecision {
  const referenceMatch =
    active != null && closed.callObject !== null && closed.callObject === active.callObject;

  const identityMatch =
    closed.identity != null && active?.identity != null && closed.identity === active.identity;

  const isClosingActiveCall = referenceMatch || identityMatch;

  // Find timerKey'en for det LUKKEDE call leg.
  // 1) Hvis vi kender call-identiteten, så slå op i mappen — det er den korrekte key
  //    også hvis det er en stale CLOSED for et tidligere opkald (så finalizeCallTimer's
  //    keyed-protection rent faktisk virker som tiltænkt).
  // 2) Hvis identiteten er null OG det er reference-match til det aktive opkald → brug
  //    fallback-keyen (det er fx tilfældet for opkald der fejler så tidligt at telnyxIDs
  //    aldrig blev sat).
  // 3) Ellers → null (finaliser ikke).
  let closedTimerKey: string | null = null;
  if (closed.identity != null) {
    closedTimerKey = identityToTimerKey.get(closed.identity) ?? null;
  } else if (referenceMatch) {
    closedTimerKey = fallbackActiveTimerKey;
  }

  return { isClosingActiveCall, closedTimerKey };
}
