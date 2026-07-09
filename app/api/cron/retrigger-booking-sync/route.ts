import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCalComConfigured, createCalComBooking } from "@/lib/calcom/client";
import { syncPostBookingIntegrations } from "@/lib/booking/post-booking-sync";
import { isPodioConfigured } from "@/lib/podio/client";
import { updateMoedeInPodio, MOEDE_STATUS } from "@/lib/podio/meeting-sync";

/**
 * Gentrig Podio + Cal.eu sync for et booket lead (production-only værktøj).
 *
 * Auth: ?token= (PODIO_WEBHOOK_SECRET) eller Authorization: Bearer AUTH_SECRET
 *
 * GET /api/cron/retrigger-booking-sync?leadId=<id>&token=<secret>
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const leadId = (url.searchParams.get("leadId") ?? "").trim();
  const token = (url.searchParams.get("token") ?? "").trim();
  const authHeader = (req.headers.get("authorization") ?? "").trim();
  const podioSecret = (process.env.PODIO_WEBHOOK_SECRET ?? "").trim();
  const authSecret = (process.env.AUTH_SECRET ?? "").trim();

  const authorized =
    (podioSecret && token === podioSecret) ||
    (authSecret && authHeader === `Bearer ${authSecret}`);

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const before = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      companyName: true,
      status: true,
      podioItemId: true,
      calComBookingUid: true,
      calComMeetingUrl: true,
    },
  });

  if (!before) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (before.status !== "MEETING_BOOKED") {
    return NextResponse.json(
      { error: `Lead status is ${before.status}, expected MEETING_BOOKED` },
      { status: 400 },
    );
  }

  await syncPostBookingIntegrations(leadId);

  let calError: string | null = null;
  const leadForCal = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      calComBookingUid: true,
      meetingScheduledFor: true,
      meetingContactName: true,
      meetingContactEmail: true,
      meetingContactPhonePrivate: true,
      notes: true,
    },
  });

  if (leadForCal && !leadForCal.calComBookingUid && leadForCal.meetingScheduledFor) {
    try {
      const booking = await createCalComBooking({
        start: leadForCal.meetingScheduledFor,
        attendeeName: leadForCal.meetingContactName,
        attendeeEmail: leadForCal.meetingContactEmail,
        attendeePhone: leadForCal.meetingContactPhonePrivate || undefined,
        notes: leadForCal.notes || undefined,
      });
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          calComBookingUid: booking.uid,
          calComMeetingUrl: booking.meetingUrl,
        },
      });
      await updateMoedeInPodio(leadId, {
        status: MOEDE_STATUS.afventer,
        newStart: leadForCal.meetingScheduledFor,
        meetingUrl: booking.meetingUrl,
      });
    } catch (err) {
      calError = err instanceof Error ? err.message : String(err);
    }
  }

  const after = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      podioItemId: true,
      calComBookingUid: true,
      calComMeetingUrl: true,
    },
  });

  return NextResponse.json({
    ok: true,
    leadId,
    configured: {
      podio: isPodioConfigured(),
      calcom: isCalComConfigured(),
    },
    before: {
      podioItemId: before.podioItemId,
      calComBookingUid: before.calComBookingUid,
      calComMeetingUrl: before.calComMeetingUrl,
    },
    after,
    calError,
    success: Boolean(after?.podioItemId && after?.calComBookingUid),
  });
}
