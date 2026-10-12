/** Statusser hvor Tilbagekald kan planlægges — inkl. rettelse af forkert udfald. */
const SCHEDULABLE_STATUSES = new Set([
  "NEW",
  "VOICEMAIL",
  "NOT_HOME",
  "NOT_INTERESTED",
  "UNQUALIFIED",
  "CALLBACK_SCHEDULED",
]);

export type CallbackScheduleLeadFields = {
  status: string;
  callbackStatus?: string | null;
};

export function canScheduleCallbackFromLead(lead: CallbackScheduleLeadFields): boolean {
  const status = String(lead.status ?? "").trim().toUpperCase();
  if (!SCHEDULABLE_STATUSES.has(status)) return false;
  if (status === "CALLBACK_SCHEDULED") {
    return String(lead.callbackStatus ?? "PENDING").trim().toUpperCase() === "PENDING";
  }
  return true;
}
