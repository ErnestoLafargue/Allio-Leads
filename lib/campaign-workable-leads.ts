import type { Prisma } from "@prisma/client";

/**
 * På kampagneoversigten tælles kun leads der stadig kan bearbejdes i køen —
 * ikke afsluttede udfald som «Ikke interesseret», «Ukvalificeret» og «Slet».
 */
export const LEAD_STATUS_EXCLUDED_FROM_CAMPAIGN_WORKABLE_COUNT = [
  "NOT_INTERESTED",
  "UNQUALIFIED",
  "DELETED",
] as const;

export const workableCampaignLeadsWhere: Pick<Prisma.LeadWhereInput, "status"> = {
  status: { notIn: [...LEAD_STATUS_EXCLUDED_FROM_CAMPAIGN_WORKABLE_COUNT] },
};
