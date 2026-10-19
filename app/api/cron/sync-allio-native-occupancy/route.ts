import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAllioNativeConfigured, listBookings } from "@/lib/allio-native/client";
import { parseLeadIdFromAllioNotes } from "@/lib/allio-native/notes";
import {
  removeNativeOccupancy,
  upsertNativeOccupancyFromBooking,
} from "@/lib/allio-native/occupancy";
import { authorizePodioCron } from "@/lib/podio/cron-auth";

function authorize(req: Request): boolean {
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const authorizedBySecret = Boolean(expected) && auth === `Bearer ${expected}`;
  return isVercelCron || authorizedBySecret || authorizePodioCron(req);
}

/**
 * GET /api/cron/sync-allio-native-occupancy
 * Sikkerhedsnet: hent nyligt opdaterede Native-bookinger og spejl occupancy (+ lead-link).
 */
export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAllioNativeConfigured()) {
    return NextResponse.json({ ok: true, skipped: "not_configured" });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let bookings;
  try {
    bookings = await listBookings({ updated_since: since, limit: 100 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  let occupancyUpserts = 0;
  let occupancyRemoved = 0;
  let linkedLeads = 0;

  for (const b of bookings) {
    if (!b.id) continue;
    const leadIdFromNotes = parseLeadIdFromAllioNotes(b.notes);
    const lead =
      (await prisma.lead.findFirst({
        where: { allioBookingId: b.id },
        select: { id: true },
      })) ??
      (leadIdFromNotes
        ? await prisma.lead.findUnique({
            where: { id: leadIdFromNotes },
            select: { id: true },
          })
        : null);

    if (lead) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { allioBookingId: b.id },
      });
      linkedLeads += 1;
    }

    const status = String(b.status ?? "confirmed").toLowerCase();
    if (status === "cancelled" || !b.start_time || !b.end_time) {
      await removeNativeOccupancy(b.id);
      occupancyRemoved += 1;
      continue;
    }

    await upsertNativeOccupancyFromBooking(b, status);
    occupancyUpserts += 1;
  }

  return NextResponse.json({
    ok: true,
    fetched: bookings.length,
    occupancyUpserts,
    occupancyRemoved,
    linkedLeads,
  });
}
