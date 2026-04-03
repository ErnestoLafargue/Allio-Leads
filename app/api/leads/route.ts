import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { stringifyCustomFields } from "@/lib/custom-fields";
import { meetingContactEmailValid } from "@/lib/meeting-contact-validation";
import { pickLeadCreateData } from "@/lib/prisma-lead-write";
import { applyLeadCooldownResets } from "@/lib/lead-cooldown";
import { filterLeadsByCampaignProtectedSetting } from "@/lib/reklamebeskyttet-filter";
import { releaseExpiredLocksEverywhere } from "@/lib/lead-lock";
import { getLeadIdsWithOutcomeLogToday } from "@/lib/lead-outcome-today";
import { copenhagenDayBoundsUtc, copenhagenDayBoundsUtcFromDayKey } from "@/lib/copenhagen-day";
import { isLeadStatus } from "@/lib/lead-status";

export async function GET(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const campaignId = searchParams.get("campaignId")?.trim() ?? "";
  const outcomeStats = searchParams.get("outcomeStats") === "1";
  const addedToday = searchParams.get("addedToday") === "1";
  const fromDate = searchParams.get("fromDate")?.trim() ?? "";
  const toDate = searchParams.get("toDate")?.trim() ?? "";
  const statusFilter = searchParams.get("status")?.trim().toUpperCase() ?? "";

  try {
    await applyLeadCooldownResets();
    await releaseExpiredLocksEverywhere(prisma);

    if (outcomeStats) {
      if (!campaignId) {
        return NextResponse.json(
          { error: "outcomeStats kræver campaignId" },
          { status: 400 },
        );
      }
      const rowsRaw = await prisma.lead.findMany({
        where: { campaignId },
        select: { status: true, customFields: true, callbackReservedByUserId: true },
        orderBy: { importedAt: "desc" },
      });
      const rows =
        session.user.role === "ADMIN"
          ? rowsRaw
          : rowsRaw.filter(
              (r) =>
                r.status !== "CALLBACK_SCHEDULED" || r.callbackReservedByUserId === session.user.id,
            );
      return NextResponse.json(rows);
    }

    let includeProtectedBusinesses = false;
    if (campaignId) {
      const camp = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { includeProtectedBusinesses: true },
      });
      if (camp) {
        includeProtectedBusinesses = camp.includeProtectedBusinesses;
      }
    }

    const importedAtFilter: { gte?: Date; lt?: Date } = {};
    try {
      if (addedToday) {
        const { start, end } = copenhagenDayBoundsUtc();
        importedAtFilter.gte = start;
        importedAtFilter.lt = end;
      } else {
        if (fromDate) {
          const { start } = copenhagenDayBoundsUtcFromDayKey(fromDate);
          importedAtFilter.gte = start;
        }
        if (toDate) {
          const { end } = copenhagenDayBoundsUtcFromDayKey(toDate);
          importedAtFilter.lt = end;
        }
      }
    } catch {
      return NextResponse.json({ error: "Ugyldigt datofilter" }, { status: 400 });
    }

    const statusWhere =
      statusFilter === "NO_OUTCOME"
        ? { status: "NEW" }
        : statusFilter && statusFilter !== "ANY" && isLeadStatus(statusFilter)
          ? { status: statusFilter }
          : {};

    const leads = await prisma.lead.findMany({
      where: {
        ...(campaignId ? { campaignId } : {}),
        ...(Object.keys(importedAtFilter).length > 0 ? { importedAt: importedAtFilter } : {}),
        ...statusWhere,
        ...(q
          ? {
              OR: [
                { companyName: { contains: q } },
                { phone: { contains: q } },
                { email: { contains: q } },
                { cvr: { contains: q } },
                { address: { contains: q } },
                { postalCode: { contains: q } },
                { city: { contains: q } },
                { industry: { contains: q } },
                { notes: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { importedAt: "desc" },
      include: {
        bookedByUser: { select: { id: true, name: true, username: true } },
        campaign: { select: { id: true, name: true } },
        lockedByUser: { select: { id: true, name: true, username: true } },
      },
    });

    let out = campaignId
      ? filterLeadsByCampaignProtectedSetting(leads, includeProtectedBusinesses)
      : leads;

    if (session.user.role !== "ADMIN") {
      const uid = session.user.id;
      out = out.filter(
        (l) => l.status !== "CALLBACK_SCHEDULED" || l.callbackReservedByUserId === uid,
      );
    }

    if (campaignId && out.length > 0) {
      const outcomeToday = await getLeadIdsWithOutcomeLogToday(out.map((l) => l.id));
      out = out.map((l) => ({
        ...l,
        hasOutcomeLogToday: outcomeToday.has(l.id),
      }));
    }

    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const migrationHint =
      msg.includes("importedAt") ||
      msg.includes("voicemailMarkedAt") ||
      msg.includes("notHomeMarkedAt") ||
      msg.includes("lockedByUserId") ||
      msg.includes("lockExpiresAt") ||
      msg.includes("no such column") ||
      msg.toLowerCase().includes("does not exist");
    return NextResponse.json(
      {
        error: migrationHint
          ? "Databasen matcher ikke koden (manglende kolonner eller migration). Kør «npx prisma migrate deploy» i projektmappen «allio-leads» og genstart udviklingsserveren."
          : "Kunne ikke læse leads fra databasen.",
        details: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";

  if (!campaignId || !companyName) {
    return NextResponse.json(
      { error: "Kampagne og virksomhedsnavn er påkrævet" },
      { status: 400 },
    );
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    return NextResponse.json({ error: "Kampagne findes ikke" }, { status: 400 });
  }

  const email = typeof body?.email === "string" ? body.email : "";
  const cvr = typeof body?.cvr === "string" ? body.cvr : "";
  const address = typeof body?.address === "string" ? body.address : "";
  const postalCode = typeof body?.postalCode === "string" ? body.postalCode : "";
  const city = typeof body?.city === "string" ? body.city : "";
  const industry = typeof body?.industry === "string" ? body.industry : "";
  const notes = typeof body?.notes === "string" ? body.notes : "";
  const meetingContactName =
    typeof body?.meetingContactName === "string" ? body.meetingContactName.trim() : "";
  const meetingContactEmail =
    typeof body?.meetingContactEmail === "string" ? body.meetingContactEmail.trim() : "";
  const meetingContactPhonePrivate =
    typeof body?.meetingContactPhonePrivate === "string"
      ? body.meetingContactPhonePrivate.trim()
      : "";

  if (meetingContactEmail.length > 0 && !meetingContactEmailValid(meetingContactEmail)) {
    return NextResponse.json({ error: "Ugyldig e-mail til mødekontakten." }, { status: 400 });
  }

  const custom: Record<string, string> = {};
  if (body?.customFields && typeof body.customFields === "object" && body.customFields !== null) {
    for (const [k, v] of Object.entries(body.customFields as Record<string, unknown>)) {
      custom[k] = typeof v === "string" ? v : String(v ?? "");
    }
  }

  const lead = await prisma.lead.create({
    data: pickLeadCreateData({
      campaignId,
      companyName,
      phone,
      email,
      cvr,
      address,
      postalCode,
      city,
      industry,
      notes,
      meetingContactName,
      meetingContactEmail,
      meetingContactPhonePrivate,
      customFields: stringifyCustomFields(custom),
      status: "NEW",
    }),
  });

  return NextResponse.json(lead);
}
