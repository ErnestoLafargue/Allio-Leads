/**
 * Skelner mellem VoIP i kampagnearbejdsflowet (predictive/power kan bruges) og
 * VoIP åbnet fra lead-detalje / møder / tilbagekald (altid manuel click-to-call).
 */
export const VOIP_API_CONTEXT = {
  CAMPAIGN_ARBEJD: "campaign_arbejd",
  GLOBAL_LEAD_PAGE: "global_lead_page",
} as const;

export type VoipApiContext = (typeof VOIP_API_CONTEXT)[keyof typeof VOIP_API_CONTEXT];

export function parseVoipApiContext(
  body: { voipApiContext?: string } | null | undefined,
): VoipApiContext {
  if (body?.voipApiContext === VOIP_API_CONTEXT.GLOBAL_LEAD_PAGE) {
    return VOIP_API_CONTEXT.GLOBAL_LEAD_PAGE;
  }
  return VOIP_API_CONTEXT.CAMPAIGN_ARBEJD;
}

export function isGlobalLeadPageVoipContext(c: VoipApiContext): boolean {
  return c === VOIP_API_CONTEXT.GLOBAL_LEAD_PAGE;
}
