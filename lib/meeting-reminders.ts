import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { copenhagenDayBoundsUtcFromDayKey, copenhagenDayKey } from "@/lib/copenhagen-day";
import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";
import { sendTelnyxSms } from "@/lib/telnyx-messaging";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";

function firstName(name: string): string {
  const n = name.trim();
  if (!n) return "der";
  return n.split(/\s+/u)[0] ?? n;
}

function formatMeetingTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("da-DK", {
    timeZone: "Europe/Copenhagen",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildReminderSms(name: string, meetings: { meetingScheduledFor: string; meetingContactName: string; companyName: string }[]): string {
  const count = meetings.length;
  const header = `Hej ${firstName(name)}, du har ${count} ${count === 1 ? "møde" : "møder"} i morgen:`;
  const lines = meetings
    .sort((a, b) => new Date(a.meetingScheduledFor).getTime() - new Date(b.meetingScheduledFor).getTime())
    .map((m) => `Kl. ${formatMeetingTime(m.meetingScheduledFor)} med ${m.meetingContactName || "ukendt kontakt"} fra ${m.companyName}`);
  return `${header}\n\n${lines.join("\n")}`;
}

/**
 * Sender SMS via Telnyx `POST /v2/messages`.
 *
 * Afsender (`from`): sæt `TELNYX_SMS_FROM_NUMBER` i Vercel (anbefalet til SMS), ellers
 * falder vi tilbage til `TELNYX_FROM_NUMBER`. Værdien skal være et E.164-nummer som i
 * Telnyx-portalen er aktiveret til **udgående SMS** (Messaging) — typisk samme pulje som
 * jeres voice-numre (+45…), men det er konto-/nummerkonfiguration, ikke antaget i koden.
 */
export async function sendTomorrowMeetingReminders() {
  const apiKey = process.env.TELNYX_API_KEY?.trim() || "";
  const fromRaw =
    process.env.TELNYX_SMS_FROM_NUMBER?.trim() || process.env.TELNYX_FROM_NUMBER?.trim() || "";
  const from = normalizePhoneToE164ForDial(fromRaw);
  if (!apiKey || !from) {
    throw new Error("Mangler TELNYX_API_KEY eller gyldigt TELNYX_SMS_FROM_NUMBER/TELNYX_FROM_NUMBER.");
  }

  const tomorrowRef = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const tomorrowDayKey = copenhagenDayKey(tomorrowRef);
  const { start, end } = copenhagenDayBoundsUtcFromDayKey(tomorrowDayKey);

  const rows = await prisma.lead.findMany({
    where: {
      status: "MEETING_BOOKED",
      assignedUserId: { not: null },
      meetingScheduledFor: { not: null, gte: start, lt: end },
      assignedUser: { is: { phone: { not: null } } },
    },
    select: {
      id: true,
      companyName: true,
      meetingContactName: true,
      meetingScheduledFor: true,
      assignedUserId: true,
      assignedUser: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { meetingScheduledFor: "asc" },
  });

  const groups = new Map<
    string,
    { user: { id: string; name: string; phone: string }; meetings: { id: string; meetingScheduledFor: string; meetingContactName: string; companyName: string }[] }
  >();

  for (const row of rows) {
    if (!row.assignedUserId || !row.assignedUser?.phone || !row.meetingScheduledFor) continue;
    const to = normalizePhoneToE164ForDial(row.assignedUser.phone);
    if (!to) continue;
    const current = groups.get(row.assignedUserId);
    const payload = {
      id: row.id,
      meetingScheduledFor: row.meetingScheduledFor.toISOString(),
      meetingContactName: row.meetingContactName,
      companyName: row.companyName,
    };
    if (!current) {
      groups.set(row.assignedUserId, {
        user: { id: row.assignedUser.id, name: row.assignedUser.name, phone: to },
        meetings: [payload],
      });
    } else {
      current.meetings.push(payload);
    }
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const group of groups.values()) {
    const text = buildReminderSms(group.user.name, group.meetings);
    const created = await prisma.meetingReminderDispatch
      .create({
        data: {
          reminderDayKey: tomorrowDayKey,
          userId: group.user.id,
          meetingCount: group.meetings.length,
          phone: group.user.phone,
          smsText: text,
        },
      })
      .then(() => true)
      .catch((err: unknown) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
        throw err;
      });

    if (!created) {
      skipped += 1;
      continue;
    }

    const smsResult = await sendTelnyxSms({
      apiKey,
      from,
      to: group.user.phone,
      text,
    });
    if (!smsResult.ok) {
      await prisma.meetingReminderDispatch.deleteMany({
        where: { reminderDayKey: tomorrowDayKey, userId: group.user.id },
      });
      errors.push(`${group.user.name}: ${smsResult.message}`);
      continue;
    }

    sent += 1;
    await prisma.leadActivityEvent.createMany({
      data: group.meetings.map((m) => ({
        leadId: m.id,
        userId: null,
        kind: LEAD_ACTIVITY_KIND.MEETING_REMINDER_SMS,
        summary: `System sendte SMS-reminder til ${group.user.name} for mødet i morgen`,
      })),
    });
  }

  return {
    reminderDayKey: tomorrowDayKey,
    usersFound: groups.size,
    smsSent: sent,
    smsSkippedAlreadySent: skipped,
    errors,
  };
}

