import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { canAccessBookedMeetingNotes } from "@/lib/lead-meeting-access";
import { canAccessCallbackLead } from "@/lib/lead-callback-access";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";

type ActivityItemKind =
  | "visit"
  | "note"
  | "call"
  | "call_attempt"
  | "outcome"
  | "callback_schedule";

function mapDbKindToItemKind(dbKind: string): ActivityItemKind {
  switch (dbKind) {
    case LEAD_ACTIVITY_KIND.CALL_RECORDING:
      return "call";
    case LEAD_ACTIVITY_KIND.CALL_ATTEMPT:
      return "call_attempt";
    case LEAD_ACTIVITY_KIND.OUTCOME_SET:
      return "outcome";
    case LEAD_ACTIVITY_KIND.CALLBACK_SCHEDULE:
      return "callback_schedule";
    case LEAD_ACTIVITY_KIND.NOTE_UPDATE:
    default:
      return "note";
  }
}

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id } = await params;

  try {
    const lead = await prisma.lead.findUnique({
      where: { id },
      select: {
        id: true,
        campaignId: true,
        status: true,
        bookedByUserId: true,
        callbackReservedByUserId: true,
      },
    });
    if (!lead) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });

    if (!canAccessCallbackLead(session.user.role, session.user.id, lead)) {
      return NextResponse.json(
        { error: "Du har ikke adgang til dette leads aktivitet." },
        { status: 403 },
      );
    }
    if (!canAccessBookedMeetingNotes(session.user.role, session.user.id, lead)) {
      return NextResponse.json(
        { error: "Du har ikke adgang til dette leads aktivitet." },
        { status: 403 },
      );
    }

    const [visits, events] = await Promise.all([
      prisma.leadVisitHistory.findMany({
        where: { leadId: id },
        orderBy: { visitedAt: "desc" },
        take: 60,
        include: {
          user: { select: { id: true, name: true, username: true } },
        },
      }),
      prisma.leadActivityEvent.findMany({
        where: { leadId: id },
        orderBy: { createdAt: "desc" },
        take: 60,
        include: {
          user: { select: { id: true, name: true, username: true } },
        },
      }),
    ]);

    const visitItems = visits.map((v) => ({
      kind: "visit" as const,
      at: v.visitedAt.toISOString(),
      summary: `${v.user.name} åbnede leadet i arbejdskøen`,
      user: { name: v.user.name, username: v.user.username },
      recordingUrl: null as string | null,
      durationSeconds: null as number | null,
    }));

    const eventItems = events.map((e) => ({
      kind: mapDbKindToItemKind(e.kind),
      at: e.createdAt.toISOString(),
      summary: e.summary,
      user: e.user ? { name: e.user.name, username: e.user.username } : null,
      recordingUrl: e.recordingUrl,
      durationSeconds: e.durationSeconds,
    }));

    const items = [...visitItems, ...eventItems].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );

    return NextResponse.json({ items: items.slice(0, 100) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const migrationHint =
      msg.includes("LeadActivityEvent") ||
      msg.includes("leadActivityEvent") ||
      msg.includes("no such column") ||
      msg.toLowerCase().includes("does not exist");
    return NextResponse.json(
      {
        error: migrationHint
          ? "Databasen mangler aktivitetstabellen. Kør «npx prisma migrate deploy» og genstart serveren."
          : "Kunne ikke hente aktivitet.",
        details: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    );
  }
}
