import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAllioNativeConfigured } from "@/lib/allio-native/client";
import { ensureAllioNativeBookingForLead } from "@/lib/allio-native/sync-lead-booking";
import { authorizePodioCron } from "@/lib/podio/cron-auth";

export const maxDuration = 300;

/** Højst så mange møder pr. kørsel (hvert kan tage op til ~30 s, når Allios gateway er langsom). */
const BATCH = 6;

function authorize(req: Request): boolean {
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const authorizedBySecret = Boolean(expected) && auth === `Bearer ${expected}`;
  return isVercelCron || authorizedBySecret || authorizePodioCron(req);
}

/**
 * GET /api/cron/sync-allio-native-bookings
 * Sikkerhedsnet: kommende bookede møder, der ikke har fået en booking i Allio (fx fordi Allios gateway
 * svarede med en timeout), forsøges igen. ensureAllioNativeBookingForLead finder selv kunde og booking,
 * hvis de allerede er oprettet, så der ikke kommer dubletter.
 */
export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAllioNativeConfigured()) {
    return NextResponse.json({ ok: true, skipped: "not_configured" });
  }

  const leads = await prisma.lead.findMany({
    where: {
      status: "MEETING_BOOKED",
      allioBookingId: null,
      meetingScheduledFor: { gte: new Date() },
      meetingContactName: { not: "" },
      meetingContactEmail: { not: "" },
    },
    orderBy: { meetingScheduledFor: "asc" },
    take: BATCH,
    select: { id: true },
  });

  const results: { leadId: string; bookingId?: string; skipped?: boolean; error?: string }[] = [];
  for (const lead of leads) {
    try {
      const result = await ensureAllioNativeBookingForLead(lead.id);
      results.push({ leadId: lead.id, bookingId: result.bookingId, skipped: result.skipped });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[sync-allio-native-bookings] lead=${lead.id} fejlede:`, message);
      results.push({ leadId: lead.id, error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: leads.length,
    synced: results.filter((r) => r.bookingId).length,
    results,
  });
}
