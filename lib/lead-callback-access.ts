import type { Prisma } from "@prisma/client";

type LeadCallbackFields = {
  status: string;
  callbackReservedByUserId: string | null;
};

export function isCallbackScheduledLead(lead: LeadCallbackFields): boolean {
  return isCallbackWorkLead(lead);
}

/** Åbent tilbagekald — brug `activeLead.status`, ikke formularens udfald (den vises som Ny). */
export function isCallbackWorkLead(
  lead: { status?: string | null } | null | undefined,
): boolean {
  return String(lead?.status ?? "").trim().toUpperCase() === "CALLBACK_SCHEDULED";
}

/**
 * Fuld adgang til lead med planlagt callback: administrator eller den sælger der reserverede leadet.
 * Gælder lead-siden og gem/udfald. Dialeren bruger den strengere `isCallbackReservedForOtherUser`.
 */
export function canAccessCallbackLead(role: string, userId: string, lead: LeadCallbackFields): boolean {
  if (!isCallbackScheduledLead(lead)) return true;
  if (role === "ADMIN") return true;
  return lead.callbackReservedByUserId === userId;
}

/**
 * Dialeren (kø, «næste lead», Power, klik i liste/historik): et lead med aktivt tilbagekald tilhører
 * kun den tildelte sælger, indtil udfaldet ændres — også admins afvises her. Admins kan bevidst åbne
 * leadet på lead-siden (`canAccessCallbackLead`) for at rydde op eller flytte tilbagekaldet.
 * Et tilbagekald uden tildelt (brugeren er slettet) tilhører ingen i dialeren.
 */
export function isCallbackReservedForOtherUser(userId: string, lead: LeadCallbackFields): boolean {
  return isCallbackScheduledLead(lead) && lead.callbackReservedByUserId !== userId;
}

/** Fejltekst til en anden bruger, der prøver at åbne eller låse leadet. */
export function callbackReservedForOtherUserMessage(ownerName: string | null | undefined): string {
  const who = ownerName?.trim() || "en anden sælger";
  return `Leadet har et planlagt tilbagekald hos ${who} og kan kun åbnes af den sælger, indtil udfaldet ændres.`;
}

/**
 * Samme regel som `isCallbackReservedForOtherUser` som Prisma-filter. Bruges i samme UPDATE som
 * låsen, så ingen kan nå at låse leadet mellem tjek og lås.
 */
export function notCallbackReservedForOtherUserWhere(userId: string): Prisma.LeadWhereInput {
  return {
    OR: [{ status: { not: "CALLBACK_SCHEDULED" } }, { callbackReservedByUserId: userId }],
  };
}
