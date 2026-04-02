import type { LeadStatus } from "@/lib/lead-status";

/** Felter til PATCH /api/leads/:id fra kampagne-arbejdsformularen. */
export type CampaignLeadFormSnapshot = {
  companyName: string;
  phone: string;
  email: string;
  cvr: string;
  address: string;
  postalCode: string;
  city: string;
  industry: string;
  notes: string;
  customFields: Record<string, string>;
  status: LeadStatus;
  meetingScheduledFor: string;
  meetingContactName: string;
  meetingContactEmail: string;
  meetingContactPhonePrivate: string;
};

/**
 * Samme payload som tidligere saveLead — bruges til synkron gem og baggrundsgem.
 * Ved MEETING_BOOKED skal `meetingScheduledForISO` være sat (eller gyldig local string i snapshot).
 */
export function buildCampaignLeadPatchBody(
  s: CampaignLeadFormSnapshot,
  opts?: { meetingScheduledForISO?: string },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    companyName: s.companyName,
    phone: s.phone,
    email: s.email,
    cvr: s.cvr,
    address: s.address,
    postalCode: s.postalCode,
    city: s.city,
    industry: s.industry,
    notes: s.notes,
    customFields: s.customFields,
    status: s.status,
  };
  if (s.status === "MEETING_BOOKED") {
    const iso =
      opts?.meetingScheduledForISO ??
      (s.meetingScheduledFor ? new Date(s.meetingScheduledFor).toISOString() : undefined);
    body.meetingScheduledFor = iso;
    body.meetingContactName = s.meetingContactName.trim();
    body.meetingContactEmail = s.meetingContactEmail.trim();
    body.meetingContactPhonePrivate = s.meetingContactPhonePrivate.trim();
  }
  return body;
}
