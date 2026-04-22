export const DIAL_MODES = [
  "NO_DIAL",
  "CLICK_TO_CALL",
  "POWER_DIALER",
  "PREDICTIVE",
] as const;

export type CampaignDialMode = (typeof DIAL_MODES)[number];

export const DIAL_MODE_LABELS: Record<CampaignDialMode, string> = {
  NO_DIAL: "No Dial",
  CLICK_TO_CALL: "Click to call",
  POWER_DIALER: "Power Dialer",
  PREDICTIVE: "Predictive",
};

export function normalizeCampaignDialMode(raw: string | null | undefined): CampaignDialMode {
  const u = String(raw ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (u === "CLICK_TO_CALL" || u === "CLICKTOCALL") return "CLICK_TO_CALL";
  if (u === "POWER_DIALER" || u === "POWERDIALER") return "POWER_DIALER";
  if (u === "PREDICTIVE") return "PREDICTIVE";
  return "NO_DIAL";
}

export function campaignUsesVoipUi(mode: CampaignDialMode): boolean {
  return mode === "CLICK_TO_CALL" || mode === "POWER_DIALER" || mode === "PREDICTIVE";
}

export function campaignShowsStartButton(mode: CampaignDialMode): boolean {
  return campaignUsesVoipUi(mode);
}
