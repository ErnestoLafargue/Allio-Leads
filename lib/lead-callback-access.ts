type LeadCallbackFields = {
  status: string;
  callbackReservedByUserId: string | null;
};

export function isCallbackScheduledLead(lead: LeadCallbackFields): boolean {
  return String(lead.status).trim().toUpperCase() === "CALLBACK_SCHEDULED";
}

/** Fuld adgang til lead med planlagt callback: administrator eller den sælger der reserverede leadet. */
export function canAccessCallbackLead(role: string, userId: string, lead: LeadCallbackFields): boolean {
  if (!isCallbackScheduledLead(lead)) return true;
  if (role === "ADMIN") return true;
  return lead.callbackReservedByUserId === userId;
}
