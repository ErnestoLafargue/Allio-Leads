import type { Lead } from "@prisma/client";
import type { LeadStatus } from "@/lib/lead-status";
import { copenhagenDayKey } from "@/lib/copenhagen-day";
import { MEETING_OUTCOME_PENDING } from "@/lib/meeting-outcome";
import { pickLeadUpdateData } from "@/lib/prisma-lead-write";

export type OutcomeOnlyResult =
  | { ok: true; data: ReturnType<typeof pickLeadUpdateData> }
  | { ok: false; error: string };

/**
 * Kun udfald (status + møde + voicemail/ikke hjemme-felter), øvrige lead-felter uændrede.
 */
export function buildLeadOutcomeOnlyUpdate(
  existing: Lead & { campaign?: { systemCampaignType: string | null } | null },
  status: LeadStatus,
  meetingScheduledForBody: string | undefined,
  userId: string,
): OutcomeOnlyResult {
  let meetingBookedAt = existing.meetingBookedAt;
  let meetingScheduledFor = existing.meetingScheduledFor;
  let bookedByUserId = existing.bookedByUserId;

  let meetingOutcomeStatus = existing.meetingOutcomeStatus ?? MEETING_OUTCOME_PENDING;
  let meetingCommissionDayKey = existing.meetingCommissionDayKey ?? "";

  if (status === "MEETING_BOOKED") {
    if (meetingScheduledForBody) {
      const d = new Date(meetingScheduledForBody);
      if (Number.isNaN(d.getTime())) {
        return { ok: false, error: "Ugyldig dato for møde" };
      }
      meetingScheduledFor = d;
    } else if (!existing.meetingScheduledFor) {
      return { ok: false, error: "Angiv hvornår mødet er (dato/tid)" };
    }

    if (existing.status !== "MEETING_BOOKED" || !existing.meetingBookedAt) {
      meetingBookedAt = new Date();
      bookedByUserId = userId;
      meetingOutcomeStatus = MEETING_OUTCOME_PENDING;
      meetingCommissionDayKey = copenhagenDayKey(meetingBookedAt);
    } else {
      if (!meetingCommissionDayKey.trim() && meetingBookedAt) {
        meetingCommissionDayKey = copenhagenDayKey(meetingBookedAt);
      }
    }
  } else {
    const preserveMeetingWhenRebooking = existing.campaign?.systemCampaignType === "rebooking";
    if (preserveMeetingWhenRebooking) {
      meetingBookedAt = existing.meetingBookedAt;
      meetingScheduledFor = existing.meetingScheduledFor;
      bookedByUserId = existing.bookedByUserId;
      meetingOutcomeStatus = MEETING_OUTCOME_PENDING;
      meetingCommissionDayKey = existing.meetingCommissionDayKey ?? "";
    } else {
      meetingBookedAt = null;
      meetingScheduledFor = null;
      bookedByUserId = null;
      meetingOutcomeStatus = MEETING_OUTCOME_PENDING;
      meetingCommissionDayKey = "";
    }
  }

  const meetingContactName =
    status === "MEETING_BOOKED" || existing.campaign?.systemCampaignType === "rebooking"
      ? existing.meetingContactName ?? ""
      : "";
  const meetingContactEmail =
    status === "MEETING_BOOKED" || existing.campaign?.systemCampaignType === "rebooking"
      ? existing.meetingContactEmail ?? ""
      : "";
  const meetingContactPhonePrivate =
    status === "MEETING_BOOKED" || existing.campaign?.systemCampaignType === "rebooking"
      ? existing.meetingContactPhonePrivate ?? ""
      : "";

  let voicemailMarkedAt = existing.voicemailMarkedAt;
  let notHomeMarkedAt = existing.notHomeMarkedAt;

  if (status === "VOICEMAIL") {
    if (existing.status !== "VOICEMAIL" || !existing.voicemailMarkedAt) {
      voicemailMarkedAt = new Date();
    }
    notHomeMarkedAt = null;
  } else if (status === "NOT_HOME") {
    if (existing.status !== "NOT_HOME" || !existing.notHomeMarkedAt) {
      notHomeMarkedAt = new Date();
    }
    voicemailMarkedAt = null;
  } else {
    voicemailMarkedAt = null;
    notHomeMarkedAt = null;
  }

  let callbackScheduledFor: Date | null = existing.callbackScheduledFor;
  let callbackReservedByUserId: string | null = existing.callbackReservedByUserId;
  let callbackNote = existing.callbackNote ?? "";
  let callbackCreatedByUserId: string | null = existing.callbackCreatedByUserId;
  let callbackStatus = existing.callbackStatus ?? "PENDING";
  let callbackSeenByAssigneeAt: Date | null = existing.callbackSeenByAssigneeAt ?? null;
  if (existing.status === "CALLBACK_SCHEDULED" && status !== "CALLBACK_SCHEDULED") {
    callbackScheduledFor = null;
    callbackReservedByUserId = null;
    callbackNote = "";
    callbackCreatedByUserId = null;
    callbackStatus = "PENDING";
    callbackSeenByAssigneeAt = null;
  }

  let bookedFromRebookingCampaign = existing.bookedFromRebookingCampaign ?? false;
  if (status !== "MEETING_BOOKED") {
    bookedFromRebookingCampaign = false;
  } else if (existing.status !== "MEETING_BOOKED" || !existing.meetingBookedAt) {
    bookedFromRebookingCampaign = existing.campaign?.systemCampaignType === "rebooking";
  }

  return {
    ok: true,
    data: pickLeadUpdateData({
      companyName: existing.companyName,
      phone: existing.phone,
      email: existing.email,
      cvr: existing.cvr,
      address: existing.address,
      postalCode: existing.postalCode,
      city: existing.city,
      industry: existing.industry,
      notes: existing.notes,
      customFields: existing.customFields,
      status,
      meetingBookedAt,
      meetingScheduledFor,
      bookedByUserId,
      meetingContactName,
      meetingContactEmail,
      meetingContactPhonePrivate,
      meetingOutcomeStatus,
      meetingCommissionDayKey,
      bookedFromRebookingCampaign,
      voicemailMarkedAt,
      notHomeMarkedAt,
      callbackScheduledFor,
      callbackReservedByUserId,
      callbackNote,
      callbackCreatedByUserId,
      callbackStatus,
      callbackSeenByAssigneeAt,
    }),
  };
}
