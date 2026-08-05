/**
 * Hvilken kampagne brugeren ringer i lige nu (browser-only, modul-level state).
 *
 * Dialer-tid krediteres normalt ud fra pathname (`/kampagner/[id]/arbejd`), men
 * VoIP-strippen bruges også på lead-detaljesiden. Strippen registrerer derfor
 * kampagnen her mens linjen er i brug, så `PresenceHeartbeat` kan kreditere
 * dialer-tid uanset hvilken side opkaldet foretages fra.
 *
 * Modul-level frem for React-context: kun én VoIP-strip kan have en aktiv linje
 * ad gangen, og heartbeatet skal kunne læse værdien uden at re-rendere noget.
 */

let activeDialerCampaignId: string | null = null;

export function setActiveDialerCampaign(campaignId: string | null): void {
  activeDialerCampaignId = campaignId?.trim() || null;
}

export function getActiveDialerCampaign(): string | null {
  return activeDialerCampaignId;
}

/** Ryd kun hvis kampagnen stadig er den registrerede — undgår at et nyt opkald ryddes af et gammelt unmount. */
export function clearActiveDialerCampaignIfMatches(campaignId: string | null): void {
  if (activeDialerCampaignId === (campaignId?.trim() || null)) {
    activeDialerCampaignId = null;
  }
}
