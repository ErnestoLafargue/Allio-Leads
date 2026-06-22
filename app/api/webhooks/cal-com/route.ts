import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { applyCalRebook, applyCalReschedule } from "@/lib/calcom/webhook-apply";

/**
 * Cal.eu (Cal.com) webhook — modtager booking-events fra Cal.eu-dashboardet.
 *
 * Cal.eu-konfig (app.cal.eu → Settings → Developer → Webhooks):
 *   Subscriber URL = https://<domæne>/api/webhooks/cal-com
 *   Secret         = CALCOM_WEBHOOK_SECRET (samme værdi i miljøet)
 *   Triggers       = Booking cancelled, Booking rescheduled,
 *                    After guests didn't join cal video (+ evt. Booking no-show updated)
 *
 * Bemærk: stien hedder /cal-com (vores route-navn) — det er IKKE Cal.com US.
 * Lokalt kan Cal.eu ikke nå serveren uden HTTPS-tunnel (fx ngrok).
 *
 * Signatur: Cal sender HMAC-SHA256(rawBody, secret) som hex i headeren
 * `X-Cal-Signature-256`. Vi verificerer mod rawBody før vi behandler payload.
 *
 * uid-matching afhænger af event (verificeret mod Cal-payloads):
 *   - BOOKING_RESCHEDULED: payload.uid = NY uid, payload.rescheduleUid = GAMMEL uid
 *   - BOOKING_CANCELLED:   payload.uid = den gemte uid
 *   - *_NO_SHOW*:          payload.bookingUid
 */

const SIGNATURE_HEADER = "x-cal-signature-256";

function logWebhook(message: string, extra?: Record<string, unknown>): void {
  if (extra) {
    console.log(`[cal-webhook] ${message}`, extra);
  } else {
    console.log(`[cal-webhook] ${message}`);
  }
}

function webhookSecret(): string {
  return (process.env.CALCOM_WEBHOOK_SECRET ?? "").trim();
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = webhookSecret();
  // Hvis ingen secret er sat, kan vi ikke verificere — afvis for sikkerhedsskyld.
  if (!secret) return false;
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim(), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

type CalAttendee = { email?: string; noShow?: boolean };

type CalWebhookEnvelope = {
  triggerEvent?: string;
  payload?: {
    uid?: string;
    bookingUid?: string;
    rescheduleUid?: string;
    bookingId?: number;
    cancellationReason?: string;
    startTime?: string;
    location?: string;
    metadata?: { videoCallUrl?: string };
    attendees?: CalAttendee[];
    message?: string;
    [key: string]: unknown;
  };
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Find lead via en eller flere kandidat-uids (første match vinder). */
async function findLeadByUids(uids: string[]) {
  const candidates = uids.filter((u) => u.length > 0);
  if (candidates.length === 0) return null;
  return prisma.lead.findFirst({
    where: { calComBookingUid: { in: candidates } },
    select: { id: true },
  });
}

/** Foretræk metadata.videoCallUrl; brug kun location hvis det er en http(s)-URL. */
function pickMeetingUrl(payload: CalWebhookEnvelope["payload"]): string | null {
  const video = str(payload?.metadata?.videoCallUrl);
  if (video) return video;
  const loc = str(payload?.location);
  if (/^https?:\/\//i.test(loc)) return loc;
  return null;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get(SIGNATURE_HEADER);

  if (!verifySignature(rawBody, signature)) {
    logWebhook("afvist: ugyldig signatur", {
      hasSecret: Boolean(webhookSecret()),
      hasSignature: Boolean(signature),
    });
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  let body: CalWebhookEnvelope;
  try {
    body = rawBody ? (JSON.parse(rawBody) as CalWebhookEnvelope) : {};
  } catch {
    logWebhook("afvist: ugyldig JSON");
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const triggerEvent = str(body.triggerEvent).toUpperCase();
  const payload = body.payload ?? {};
  const uid = str(payload.uid);
  const rescheduleUid = str(payload.rescheduleUid);
  const bookingUid = str(payload.bookingUid);

  logWebhook("modtaget", { triggerEvent, uid, rescheduleUid, bookingUid });

  if (triggerEvent === "BOOKING_RESCHEDULED") {
    // Match gammel uid (rescheduleUid) først; fallback til ny uid (idempotent ved retry).
    const lead = await findLeadByUids([rescheduleUid, uid]);
    if (!lead) {
      logWebhook("BOOKING_RESCHEDULED ignoreret: intet matchende lead", { rescheduleUid, uid });
      return NextResponse.json({ ok: true, ignored: "no matching lead" });
    }

    const parsed = payload.startTime ? new Date(payload.startTime) : null;
    const newStart = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    if (!newStart || !uid) {
      logWebhook("BOOKING_RESCHEDULED ignoreret: mangler ny start/uid", { leadId: lead.id });
      return NextResponse.json({ ok: true, ignored: "missing new start/uid" });
    }

    await applyCalReschedule(lead.id, {
      newStart,
      newUid: uid,
      meetingUrl: pickMeetingUrl(payload),
    });
    logWebhook("BOOKING_RESCHEDULED håndteret", { leadId: lead.id, newUid: uid });
    return NextResponse.json({ ok: true, handled: "BOOKING_RESCHEDULED" });
  }

  if (triggerEvent === "BOOKING_CANCELLED") {
    const lead = await findLeadByUids([uid, bookingUid]);
    if (!lead) {
      logWebhook("BOOKING_CANCELLED ignoreret: intet matchende lead", { uid, bookingUid });
      return NextResponse.json({ ok: true, ignored: "no matching lead" });
    }

    await applyCalRebook(lead.id, {
      source: "cancelled",
      reason: str(payload.cancellationReason),
    });
    logWebhook("BOOKING_CANCELLED håndteret → Genbook", { leadId: lead.id });
    return NextResponse.json({ ok: true, handled: "BOOKING_CANCELLED" });
  }

  if (
    triggerEvent === "AFTER_GUESTS_CAL_VIDEO_NO_SHOW" ||
    triggerEvent === "BOOKING_NO_SHOW_UPDATED"
  ) {
    // BOOKING_NO_SHOW_UPDATED er en manuel toggle — reagér kun når en gæst er markeret noShow:true.
    if (triggerEvent === "BOOKING_NO_SHOW_UPDATED") {
      const guestNoShow = (payload.attendees ?? []).some((a) => a?.noShow === true);
      if (!guestNoShow) {
        logWebhook("BOOKING_NO_SHOW_UPDATED ignoreret: ingen gæst markeret no-show");
        return NextResponse.json({ ok: true, ignored: "no-show unmarked" });
      }
    }

    const lead = await findLeadByUids([bookingUid, uid]);
    if (!lead) {
      logWebhook(`${triggerEvent} ignoreret: intet matchende lead`, { bookingUid, uid });
      return NextResponse.json({ ok: true, ignored: "no matching lead" });
    }

    await applyCalRebook(lead.id, { source: "no_show" });
    logWebhook(`${triggerEvent} håndteret → Genbook`, { leadId: lead.id });
    return NextResponse.json({ ok: true, handled: triggerEvent });
  }

  logWebhook("ignoreret event", { triggerEvent: triggerEvent || "unknown event" });
  return NextResponse.json({ ok: true, ignored: triggerEvent || "unknown event" });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "calcom-webhook" });
}
