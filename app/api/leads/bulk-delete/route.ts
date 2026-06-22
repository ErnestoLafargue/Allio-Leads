import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";
import { filterLeadIdsForBulkDelete } from "@/lib/lead-delete-guards";
import { deleteAllPodioArtifactsForLead } from "@/lib/podio/customer-mapping";

export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as {
    ids?: unknown;
    includeLeadsWithNotes?: unknown;
  } | null;
  const idsRaw = Array.isArray(body?.ids) ? body.ids : [];
  const ids = Array.from(
    new Set(
      idsRaw
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean),
    ),
  );
  if (ids.length === 0) {
    return NextResponse.json({ error: "Vælg mindst ét lead" }, { status: 400 });
  }

  const includeLeadsWithNotes = body?.includeLeadsWithNotes === true;

  const leads = await prisma.lead.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, notes: true },
  });

  const { deletableIds, skipped } = filterLeadIdsForBulkDelete(leads, ids, {
    includeLeadsWithNotes,
  });

  if (deletableIds.length === 0) {
    return NextResponse.json(
      {
        error:
          "Ingen af de valgte leads kan slettes. Møde booket, andet udfald end «Ny» og leads med noter (hvis du valgte det) er beskyttet.",
        skippedMeetingBooked: skipped.meetingBooked,
        skippedWithOutcome: skipped.hasOutcome,
        skippedWithNotes: skipped.hasNotes,
        deletedCount: 0,
      },
      { status: 400 },
    );
  }

  for (const leadId of deletableIds) {
    await deleteAllPodioArtifactsForLead(leadId);
  }

  const result = await prisma.lead.deleteMany({
    where: { id: { in: deletableIds } },
  });

  return NextResponse.json({
    deletedCount: result.count,
    skippedMeetingBooked: skipped.meetingBooked,
    skippedWithOutcome: skipped.hasOutcome,
    skippedWithNotes: skipped.hasNotes,
  });
}
