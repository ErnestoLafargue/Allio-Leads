import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { AllioBooking } from "@/lib/allio-native/client";
import { applyAllioNativeBookingEvent } from "@/lib/allio-native/webhook-apply";
import { verifyAllioNativeWebhookSignature } from "@/lib/allio-native/webhook-verify";

export const runtime = "nodejs";

type AllioWebhookEnvelope = {
  id?: string;
  type?: string;
  created_at?: string;
  data?: AllioBooking;
  previous_attributes?: Partial<AllioBooking>;
};

/**
 * POST /api/webhooks/allio-native
 * Modtager booking.created / booking.updated / booking.deleted fra Allio-Native.
 */
export async function POST(req: Request) {
  const secret = (process.env.ALLIO_WEBHOOK_SECRET ?? "").trim();
  if (!secret) {
    console.error("[allio-native-webhook] ALLIO_WEBHOOK_SECRET mangler");
    return NextResponse.json({ error: "Webhook ikke konfigureret" }, { status: 503 });
  }

  const rawBody = await req.text();
  const timestamp = req.headers.get("x-allio-timestamp") ?? "";
  const signature = req.headers.get("x-allio-signature") ?? "";

  if (
    !verifyAllioNativeWebhookSignature({
      rawBody,
      timestamp,
      signature,
      secret,
    })
  ) {
    return NextResponse.json({ error: "Ugyldig signatur" }, { status: 401 });
  }

  let envelope: AllioWebhookEnvelope;
  try {
    envelope = JSON.parse(rawBody) as AllioWebhookEnvelope;
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  const eventId = (envelope.id ?? req.headers.get("x-allio-event-id") ?? "").trim();
  const type = String(envelope.type ?? req.headers.get("x-allio-event") ?? "").trim();

  if (
    type !== "booking.created" &&
    type !== "booking.updated" &&
    type !== "booking.deleted"
  ) {
    return NextResponse.json({ ok: true, ignored: type || "unknown" });
  }

  if (eventId) {
    try {
      await prisma.allioNativeWebhookEvent.create({
        data: { id: eventId, type },
      });
    } catch {
      // Duplicate event id — allerede behandlet
      return NextResponse.json({ ok: true, duplicate: true });
    }
  }

  try {
    const result = await applyAllioNativeBookingEvent({
      type,
      data: envelope.data ?? ({} as AllioBooking),
      previous_attributes: envelope.previous_attributes,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(
      "[allio-native-webhook] fejl:",
      err instanceof Error ? err.message : err,
    );
    // 200 så Allio ikke deaktiverer webhooken ved midlertidige fejl — vi har allerede
    // gemt event-id; slet det så retry kan prøve igen.
    if (eventId) {
      await prisma.allioNativeWebhookEvent.deleteMany({ where: { id: eventId } }).catch(() => {});
    }
    return NextResponse.json(
      { error: "Behandling fejlede" },
      { status: 500 },
    );
  }
}
