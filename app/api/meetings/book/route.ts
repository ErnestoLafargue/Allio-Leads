import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { pickLeadCreateData } from "@/lib/prisma-lead-write";
import { stringifyCustomFields } from "@/lib/custom-fields";
import { ensureSystemCampaignId } from "@/lib/ensure-system-campaigns";
import { copenhagenDayKey } from "@/lib/copenhagen-day";
import { MEETING_OUTCOME_PENDING } from "@/lib/meeting-outcome";
import { shouldLogOutcomeForLeaderboard } from "@/lib/lead-outcome-log";
import { blockedTimeConflictMessage } from "@/lib/booking/availability";
import { findBlockedTimeConflictInDb } from "@/lib/booking/meeting-slots";
import { findLeadBookingOverlapInDb } from "@/lib/booking/overlap-db";
import { requireDefaultMeetingAssigneeId } from "@/lib/meeting-assignee";
import { canonicalLeadPhoneForStorage } from "@/lib/phone-e164";
import { ensureCalComBookingForLead } from "@/lib/calcom/sync-lead-booking";
import { ensureCustomerInPodio } from "@/lib/podio/customer-mapping";

export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;

  const body = await req.json().catch(() => null);
  const notes = typeof body?.notes === "string" ? body.notes : "";
  const meetingContactName = typeof body?.meetingContactName === "string" ? body.meetingContactName.trim() : "";
  const meetingContactEmail = typeof body?.meetingContactEmail === "string" ? body.meetingContactEmail.trim() : "";
  const meetingContactPhonePrivate =
    typeof body?.meetingContactPhonePrivate === "string"
      ? canonicalLeadPhoneForStorage(body.meetingContactPhonePrivate)
      : "";
  const meetingCompanyName =
    typeof body?.meetingCompanyName === "string" ? body.meetingCompanyName.trim() : "";
  const scheduledRaw = body?.meetingScheduledFor;

  /** Lead kræver companyName/phone — udfyldes automatisk fra mødekontakt når kunden ikke angiver virksomhed. */
  const phoneFromBody =
    typeof body?.phone === "string" ? canonicalLeadPhoneForStorage(body.phone) : "";
  const emailFromBody = typeof body?.email === "string" ? body.email.trim() : "";
  const addressFromBody = typeof body?.address === "string" ? body.address.trim() : "";

  if (!meetingCompanyName) {
    return NextResponse.json({ error: "Virksomhedsnavn til mødet er påkrævet." }, { status: 400 });
  }
  if (!meetingContactName || !meetingContactEmail || !meetingContactPhonePrivate) {
    return NextResponse.json(
      {
        error:
          "Udfyld mødekontakt: navn på person til mødet, personens e-mail og privat telefonnummer (ikke virksomhedens).",
      },
      { status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(meetingContactEmail)) {
    return NextResponse.json({ error: "Ugyldig e-mail til mødekontakten." }, { status: 400 });
  }

  const companyName = "Direkte møde";
  const phone = phoneFromBody || meetingContactPhonePrivate;
  const email = emailFromBody || meetingContactEmail;
  const address = addressFromBody;

  if (!scheduledRaw) {
    return NextResponse.json({ error: "Angiv dato og tid for mødet." }, { status: 400 });
  }
  const meetingScheduledFor = new Date(scheduledRaw as string);
  if (Number.isNaN(meetingScheduledFor.getTime())) {
    return NextResponse.json({ error: "Ugyldig dato for møde." }, { status: 400 });
  }

  const adminSkipBookingOverlap =
    session!.user.role === "ADMIN" && body?.adminSkipBookingOverlap === true;
  const assignedUserId = await requireDefaultMeetingAssigneeId();

  if (!adminSkipBookingOverlap) {
    const overlap = await findLeadBookingOverlapInDb(meetingScheduledFor);
    if (overlap) {
      return NextResponse.json(
        {
          error:
            "Tidspunktet overlapper et eksisterende møde. Hvert møde reserverer 75 min før og 75 min efter start — vælg et andet tidspunkt.",
        },
        { status: 409 },
      );
    }
    const blocked = await findBlockedTimeConflictInDb(assignedUserId, meetingScheduledFor);
    if (blocked) {
      return NextResponse.json(
        { error: blockedTimeConflictMessage(blocked.title) },
        { status: 409 },
      );
    }
  }

  const campaignId = await ensureSystemCampaignId("upcoming_meetings");
  const meetingBookedAt = new Date();

  try {
    const lead = await prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: pickLeadCreateData({
          campaignId,
          companyName,
          phone,
          email,
          cvr: "",
          address,
          postalCode: "",
          city: "",
          industry: "",
          notes,
          customFields: stringifyCustomFields({}),
          status: "MEETING_BOOKED",
          meetingBookedAt,
          meetingScheduledFor,
          bookedByUserId: userId,
          meetingContactName,
          meetingContactEmail,
          meetingContactPhonePrivate,
          meetingCompanyName,
          meetingOutcomeStatus: MEETING_OUTCOME_PENDING,
          meetingCommissionDayKey: copenhagenDayKey(meetingBookedAt),
          assignedUserId,
          lastOutcomeAt: meetingBookedAt,
        }),
        include: {
          bookedByUser: { select: { id: true, name: true, username: true } },
          campaign: { select: { id: true, name: true } },
        },
      });
      if (
        shouldLogOutcomeForLeaderboard({ status: "NEW", meetingBookedAt: null }, "MEETING_BOOKED")
      ) {
        await tx.leadOutcomeLog.create({
          data: { leadId: created.id, userId, status: "MEETING_BOOKED" },
        });
      }
      return created;
    });

    /**
     * Opret ekstern Cal.eu-booking (kalender-sync + Google Meet-link).
     * Ikke-fatal: fejler Cal.eu, beholder vi den interne booking (hybrid-model).
     */
    await ensureCalComBookingForLead({
      leadId: lead.id,
      start: meetingScheduledFor,
      attendeeName: meetingContactName,
      attendeeEmail: meetingContactEmail,
      attendeePhone: meetingContactPhonePrivate || undefined,
      notes: notes || undefined,
    });

    /**
     * Opret kunden i Podio-CRM (kunde + onboarding-møde). Ikke-fatal og
     * idempotent via Allio Lead ID. Køres efter Cal.eu, så mødelinket er sat.
     */
    await ensureCustomerInPodio(lead.id);

    const leadWithCalCom = await prisma.lead.findUnique({
      where: { id: lead.id },
      include: {
        bookedByUser: { select: { id: true, name: true, username: true } },
        campaign: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(leadWithCalCom ?? lead);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Kunne ikke oprette mødet.", details: process.env.NODE_ENV === "development" ? msg : undefined },
      { status: 500 },
    );
  }
}
