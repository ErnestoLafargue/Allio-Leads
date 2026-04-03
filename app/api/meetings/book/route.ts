import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { pickLeadCreateData } from "@/lib/prisma-lead-write";
import { stringifyCustomFields } from "@/lib/custom-fields";
import { ensureSystemCampaignId } from "@/lib/ensure-system-campaigns";
import { copenhagenDayKey } from "@/lib/copenhagen-day";
import { MEETING_OUTCOME_PENDING } from "@/lib/meeting-outcome";
import { shouldLogOutcomeForLeaderboard } from "@/lib/lead-outcome-log";
import { findLeadBookingOverlapInDb } from "@/lib/booking/overlap-db";

export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;

  const body = await req.json().catch(() => null);
  const notes = typeof body?.notes === "string" ? body.notes : "";
  const meetingContactName = typeof body?.meetingContactName === "string" ? body.meetingContactName.trim() : "";
  const meetingContactEmail = typeof body?.meetingContactEmail === "string" ? body.meetingContactEmail.trim() : "";
  const meetingContactPhonePrivate =
    typeof body?.meetingContactPhonePrivate === "string" ? body.meetingContactPhonePrivate.trim() : "";
  const scheduledRaw = body?.meetingScheduledFor;

  /** Lead kræver companyName/phone — udfyldes automatisk fra mødekontakt når kunden ikke angiver virksomhed. */
  const companyNameFromBody = typeof body?.companyName === "string" ? body.companyName.trim() : "";
  const phoneFromBody = typeof body?.phone === "string" ? body.phone.trim() : "";
  const emailFromBody = typeof body?.email === "string" ? body.email.trim() : "";
  const addressFromBody = typeof body?.address === "string" ? body.address.trim() : "";

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

  const companyName = companyNameFromBody || "Direkte møde";
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

  const overlap = await findLeadBookingOverlapInDb(meetingScheduledFor);
  if (overlap) {
    return NextResponse.json(
      {
        error:
            "Tidspunktet overlapper et eksisterende møde. Hvert møde reserverer 60 min før og 75 min efter start — vælg et andet tidspunkt.",
      },
      { status: 409 },
    );
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
          meetingOutcomeStatus: MEETING_OUTCOME_PENDING,
          meetingCommissionDayKey: copenhagenDayKey(meetingBookedAt),
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

    return NextResponse.json(lead);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Kunne ikke oprette mødet.", details: process.env.NODE_ENV === "development" ? msg : undefined },
      { status: 500 },
    );
  }
}
