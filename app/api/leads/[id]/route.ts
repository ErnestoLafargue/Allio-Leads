import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { isLeadStatus } from "@/lib/lead-status";
import { parseCustomFields, stringifyCustomFields } from "@/lib/custom-fields";
import { pickLeadUpdateData } from "@/lib/prisma-lead-write";
import { applyLeadCooldownResets } from "@/lib/lead-cooldown";
import {
  normalizeLeaderboardOutcomeStatus,
  shouldLogOutcomeForLeaderboard,
} from "@/lib/lead-outcome-log";
import { canAccessBookedMeetingNotes } from "@/lib/lead-meeting-access";
import { canAccessCallbackLead } from "@/lib/lead-callback-access";
import { copenhagenDayKey } from "@/lib/copenhagen-day";
import {
  MEETING_OUTCOME_CANCELLED,
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_REBOOK,
  MEETING_OUTCOME_SALE,
  normalizeMeetingOutcomeStatus,
} from "@/lib/meeting-outcome";
import { campaignIdForBookedMeetingOutcome } from "@/lib/meeting-campaign-routing";
import { ensureStandardCampaignId } from "@/lib/ensure-system-campaigns";
import { releaseExpiredLocksEverywhere, sellerMayEditLead } from "@/lib/lead-lock";
import { findLeadBookingOverlapInDb } from "@/lib/booking/overlap-db";

type Params = { params: Promise<{ id: string }> };

function isRealOutcomeStatus(status: string): boolean {
  return status !== "NEW" && status !== "CALLBACK_SCHEDULED";
}

export async function GET(_req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id } = await params;

  try {
    await applyLeadCooldownResets();
    await releaseExpiredLocksEverywhere(prisma);
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        bookedByUser: { select: { id: true, name: true, username: true } },
        campaign: { select: { id: true, name: true, fieldConfig: true } },
        lockedByUser: { select: { id: true, name: true, username: true } },
        callbackReservedByUser: { select: { id: true, name: true, username: true } },
      },
    });
    if (!lead) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });
    if (!canAccessCallbackLead(session.user.role, session.user.id, lead)) {
      return NextResponse.json(
        {
          error:
            "Dette lead er reserveret til et planlagt callback for en anden sælger. Du kan ikke åbne det.",
        },
        { status: 403 },
      );
    }
    if (!canAccessBookedMeetingNotes(session.user.role, session.user.id, lead)) {
      return NextResponse.json(
        {
          error:
            "Kun bookeren eller administrator kan åbne dette bookede møde med noter og kundedata.",
        },
        { status: 403 },
      );
    }
    return NextResponse.json(lead);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const migrationHint =
      msg.includes("voicemailMarkedAt") ||
      msg.includes("notHomeMarkedAt") ||
      msg.includes("lockedByUserId") ||
      msg.includes("lockExpiresAt") ||
      msg.includes("callbackScheduledFor") ||
      msg.includes("callbackReservedByUserId") ||
      msg.includes("lastOutcomeAt") ||
      msg.includes("bookedFromRebookingCampaign") ||
      msg.includes("no such column") ||
      msg.toLowerCase().includes("does not exist");
    return NextResponse.json(
      {
        error: migrationHint
          ? "Databasen er ikke opdateret. Kør «npx prisma migrate deploy» i projektmappen og genstart serveren."
          : "Kunne ikke læse lead.",
        details: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id } = await params;
  const userId = session!.user.id;

  const body = await req.json().catch(() => null);
  const queueBump = body?.queueBump === true;
  await releaseExpiredLocksEverywhere(prisma);
  const existing = await prisma.lead.findUnique({
    where: { id },
    include: { campaign: { select: { systemCampaignType: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });

  if (!canAccessBookedMeetingNotes(session.user.role, userId, existing)) {
    return NextResponse.json(
      {
        error:
          "Kun den sælger der har booket mødet (eller en administrator) kan redigere dette bookede møde.",
      },
      { status: 403 },
    );
  }

  if (!canAccessCallbackLead(session.user.role, userId, existing)) {
    return NextResponse.json(
      {
        error:
          "Dette lead er reserveret til et planlagt callback for en anden sælger. Du kan ikke redigere det.",
      },
      { status: 403 },
    );
  }

  if (!sellerMayEditLead(session.user.role, userId, existing)) {
    return NextResponse.json(
      {
        error:
          "Dette lead er låst af en anden bruger («Optaget»). Du kan ikke gemme ændringer lige nu — vent eller åbn et andet lead.",
      },
      { status: 409 },
    );
  }

  let adminMeetingOutcome: string | undefined;
  if (body && "meetingOutcomeStatus" in body) {
    if (session!.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Kun administrator kan registrere mødeudfald." }, { status: 403 });
    }
    if (typeof body.meetingOutcomeStatus !== "string") {
      return NextResponse.json({ error: "Ugyldigt mødeudfald." }, { status: 400 });
    }
    const o = body.meetingOutcomeStatus.trim().toUpperCase();
    if (
      o !== "PENDING" &&
      o !== "HELD" &&
      o !== "CANCELLED" &&
      o !== MEETING_OUTCOME_REBOOK &&
      o !== MEETING_OUTCOME_SALE
    ) {
      return NextResponse.json({ error: "Ugyldigt mødeudfald." }, { status: 400 });
    }
    adminMeetingOutcome = o;
  }

  const companyName =
    typeof body?.companyName === "string" ? body.companyName.trim() : existing.companyName;
  const phone = typeof body?.phone === "string" ? body.phone.trim() : existing.phone;
  const email = typeof body?.email === "string" ? body.email : existing.email;
  const cvr = typeof body?.cvr === "string" ? body.cvr : existing.cvr;
  const address = typeof body?.address === "string" ? body.address : existing.address;
  const postalCode =
    typeof body?.postalCode === "string" ? body.postalCode : existing.postalCode;
  const city = typeof body?.city === "string" ? body.city : existing.city;
  const industry = typeof body?.industry === "string" ? body.industry : existing.industry;
  const notes = typeof body?.notes === "string" ? body.notes : existing.notes;

  let customMerged = parseCustomFields(existing.customFields);
  if (body?.customFields && typeof body.customFields === "object" && body.customFields !== null) {
    customMerged = { ...customMerged, ...(body.customFields as Record<string, string>) };
  }

  let status = existing.status;
  if (typeof body?.status === "string" && isLeadStatus(body.status)) {
    if (body.status === "CALLBACK_SCHEDULED") {
      return NextResponse.json(
        {
          error:
            "Status «Callback planlagt» kan kun sættes via callback-planlægning i kampagne-arbejdet (ikke ved almindelig gem).",
        },
        { status: 400 },
      );
    }
    status = body.status;
  }

  let meetingBookedAt = existing.meetingBookedAt;
  let meetingScheduledFor = existing.meetingScheduledFor;
  let bookedByUserId = existing.bookedByUserId;

  let meetingContactName = existing.meetingContactName;
  let meetingContactEmail = existing.meetingContactEmail;
  let meetingContactPhonePrivate = existing.meetingContactPhonePrivate;

  let meetingOutcomeStatus = existing.meetingOutcomeStatus ?? MEETING_OUTCOME_PENDING;
  let meetingCommissionDayKey = existing.meetingCommissionDayKey ?? "";

  if (status === "MEETING_BOOKED") {
    const scheduledRaw = body?.meetingScheduledFor;
    if (scheduledRaw) {
      const d = new Date(scheduledRaw as string);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Ugyldig dato for møde" }, { status: 400 });
      }
      meetingScheduledFor = d;
    } else if (!existing.meetingScheduledFor) {
      return NextResponse.json(
        { error: "Angiv hvornår mødet er (dato/tid)" },
        { status: 400 },
      );
    }

    if (typeof body?.meetingContactName === "string") {
      meetingContactName = body.meetingContactName.trim();
    }
    if (typeof body?.meetingContactEmail === "string") {
      meetingContactEmail = body.meetingContactEmail.trim();
    }
    if (typeof body?.meetingContactPhonePrivate === "string") {
      meetingContactPhonePrivate = body.meetingContactPhonePrivate.trim();
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

    if (existing.status !== "MEETING_BOOKED" || !existing.meetingBookedAt) {
      meetingBookedAt = new Date();
      bookedByUserId = userId;
      meetingOutcomeStatus = MEETING_OUTCOME_PENDING;
      meetingCommissionDayKey = copenhagenDayKey(meetingBookedAt);
    } else if (!meetingCommissionDayKey.trim() && meetingBookedAt) {
      meetingCommissionDayKey = copenhagenDayKey(meetingBookedAt);
    }
  } else {
    const preserveMeetingWhenRebooking =
      existing.campaign?.systemCampaignType === "rebooking";

    if (preserveMeetingWhenRebooking) {
      /** Genbook møde: behold sidste booking + tider ved udfald. Mødekontakt ændres kun hvis klienten sender felter (fx lead-detalje); kampagne-gem uden felter overskriver ikke. */
      meetingBookedAt = existing.meetingBookedAt;
      meetingScheduledFor = existing.meetingScheduledFor;
      bookedByUserId = existing.bookedByUserId;
      meetingCommissionDayKey = existing.meetingCommissionDayKey ?? "";
      meetingContactName =
        typeof body?.meetingContactName === "string"
          ? body.meetingContactName.trim()
          : (existing.meetingContactName ?? "");
      meetingContactEmail =
        typeof body?.meetingContactEmail === "string"
          ? body.meetingContactEmail.trim()
          : (existing.meetingContactEmail ?? "");
      meetingContactPhonePrivate =
        typeof body?.meetingContactPhonePrivate === "string"
          ? body.meetingContactPhonePrivate.trim()
          : (existing.meetingContactPhonePrivate ?? "");
      meetingOutcomeStatus = MEETING_OUTCOME_PENDING;
    } else {
      meetingBookedAt = null;
      meetingScheduledFor = null;
      bookedByUserId = null;
      if (typeof body?.meetingContactName === "string") {
        meetingContactName = body.meetingContactName.trim();
      }
      if (typeof body?.meetingContactEmail === "string") {
        meetingContactEmail = body.meetingContactEmail.trim();
      }
      if (typeof body?.meetingContactPhonePrivate === "string") {
        meetingContactPhonePrivate = body.meetingContactPhonePrivate.trim();
      }
      meetingOutcomeStatus = MEETING_OUTCOME_PENDING;
      meetingCommissionDayKey = "";
    }
  }

  if (adminMeetingOutcome !== undefined) {
    if (status !== "MEETING_BOOKED") {
      return NextResponse.json(
        { error: "Mødeudfald kan kun sættes når leadet har status «Møde booket»." },
        { status: 400 },
      );
    }
    meetingOutcomeStatus = adminMeetingOutcome;
  }

  const meetingTimeChangedForOverlap =
    !existing.meetingScheduledFor ||
    existing.meetingScheduledFor.getTime() !== meetingScheduledFor?.getTime();
  if (
    status === "MEETING_BOOKED" &&
    meetingScheduledFor &&
    meetingTimeChangedForOverlap &&
    normalizeMeetingOutcomeStatus(meetingOutcomeStatus) !== MEETING_OUTCOME_CANCELLED
  ) {
    const overlap = await findLeadBookingOverlapInDb(meetingScheduledFor, { excludeLeadId: id });
    if (overlap) {
      return NextResponse.json(
        {
          error:
            "Det valgte tidspunkt overlapper et andet møde. Hvert møde reserverer 75 min før og 75 min efter start — vælg et andet tidspunkt.",
        },
        { status: 409 },
      );
    }
  }

  let voicemailMarkedAt: Date | null = existing.voicemailMarkedAt;
  let notHomeMarkedAt: Date | null = existing.notHomeMarkedAt;

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
  if (existing.status === "CALLBACK_SCHEDULED" && status !== "CALLBACK_SCHEDULED") {
    callbackScheduledFor = null;
    callbackReservedByUserId = null;
    callbackNote = "";
    callbackCreatedByUserId = null;
    callbackStatus = "PENDING";
  }

  const logOutcome = shouldLogOutcomeForLeaderboard(
    { status: existing.status, meetingBookedAt: existing.meetingBookedAt },
    status,
  );
  const bumpNewLeadToQueueBack =
    queueBump === true && existing.status === "NEW" && status === "NEW";
  const touchedOutcomeAt =
    existing.status !== status && isRealOutcomeStatus(status)
      ? new Date()
      : bumpNewLeadToQueueBack
        ? new Date()
        : existing.lastOutcomeAt;

  const clearLeadLock = status !== "NEW";

  let bookedFromRebookingCampaign = existing.bookedFromRebookingCampaign ?? false;
  if (status !== "MEETING_BOOKED") {
    bookedFromRebookingCampaign = false;
  } else if (existing.status !== "MEETING_BOOKED" || !existing.meetingBookedAt) {
    bookedFromRebookingCampaign = existing.campaign?.systemCampaignType === "rebooking";
  }

  let campaignIdToSet: string | null | undefined;
  if (status === "MEETING_BOOKED" && meetingScheduledFor) {
    campaignIdToSet = await campaignIdForBookedMeetingOutcome(meetingOutcomeStatus);
  } else if (existing.status === "MEETING_BOOKED" && status !== "MEETING_BOOKED") {
    /** I «Genbook møde» skal opkald-udfald (Ny, voicemail m.m.) blive i kampagnen — ellers forsvinder leadet fra genbook-køen. */
    if (existing.campaign?.systemCampaignType === "rebooking") {
      campaignIdToSet = undefined;
    } else {
      campaignIdToSet = (await ensureStandardCampaignId()) ?? undefined;
    }
  }

  const lead = await prisma.$transaction(async (tx) => {
    const updated = await tx.lead.update({
      where: { id },
      data: {
        ...pickLeadUpdateData({
          companyName,
          phone,
          email,
          cvr,
          address,
          postalCode,
          city,
          industry,
          notes,
          customFields: stringifyCustomFields(customMerged),
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
          lastOutcomeAt: touchedOutcomeAt,
        }),
        ...(campaignIdToSet !== undefined && campaignIdToSet !== null ? { campaignId: campaignIdToSet } : {}),
        ...(clearLeadLock
          ? { lockedByUserId: null, lockedAt: null, lockExpiresAt: null }
          : {}),
      },
      include: {
        bookedByUser: { select: { id: true, name: true, username: true } },
        campaign: { select: { id: true, name: true, fieldConfig: true } },
        lockedByUser: { select: { id: true, name: true, username: true } },
        callbackReservedByUser: { select: { id: true, name: true, username: true } },
      },
    });
    if (logOutcome) {
      await tx.leadOutcomeLog.create({
        data: { leadId: id, userId, status: normalizeLeaderboardOutcomeStatus(status) },
      });
    }
    return updated;
  });

  return NextResponse.json(lead);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { response } = await requireSession();
  if (response) return response;
  const { id } = await params;

  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });

  await prisma.lead.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
