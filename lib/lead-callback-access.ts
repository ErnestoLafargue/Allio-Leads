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
 * Automatisk udlevering i dialeren (kø, «næste lead», «Ring alle tildelte», Power, Predictive):
 * et lead med aktivt tilbagekald gives kun til den tildelte sælger, indtil udfaldet ændres.
 * Bevidst åbning (søgning, lead-siden, klik på leadet) er tilladt for alle.
 * Et tilbagekald uden tildelt (brugeren er slettet) udleveres ikke automatisk til nogen.
 */
export function isCallbackReservedForOtherUser(userId: string, lead: LeadCallbackFields): boolean {
  return isCallbackScheduledLead(lead) && lead.callbackReservedByUserId !== userId;
}

/**
 * Gem fra en anden end ejeren med udfald «Ny» (formularens standard på et tilbagekald) beholder
 * tilbagekaldet hos ejeren — ellers ville et almindeligt gem sende leadet tilbage i køen for alle.
 * Et rigtigt udfald (voicemail, møde booket osv.) afslutter tilbagekaldet som normalt.
 */
export function keepsCallbackOnSave(
  userId: string,
  lead: LeadCallbackFields,
  nextStatus: string,
): boolean {
  return (
    isCallbackReservedForOtherUser(userId, lead) &&
    String(nextStatus ?? "").trim().toUpperCase() === "NEW"
  );
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
