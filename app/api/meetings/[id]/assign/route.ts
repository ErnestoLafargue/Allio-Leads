import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";
import { ensureAllioNativeBookingForLead } from "@/lib/allio-native/sync-lead-booking";
import { ensureSystemCampaignId } from "@/lib/ensure-system-campaigns";
import { listMeetingAssignableUsers } from "@/lib/meeting-assignee";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import { updateMoedeSellerInPodio } from "@/lib/podio/meeting-sync";

type Params = { params: Promise<{ id: string }> };

/** PATCH { assignedUserId: string | null } — null/"" = «Ingen tildelt». Kun admin. */
export async function PATCH(req: Request, { params }: Params) {
  const { session, response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const raw = typeof body?.assignedUserId === "string" ? body.assignedUserId.trim() : "";
  const nextAssigneeId = raw || null;

  const campaignId = await ensureSystemCampaignId("upcoming_meetings");
  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, status: true, campaignId: true, assignedUserId: true, allioBookingId: true },
  });
  if (!lead || lead.status !== "MEETING_BOOKED" || lead.campaignId !== campaignId) {
    return NextResponse.json({ error: "Mødet blev ikke fundet i Kommende møder." }, { status: 404 });
  }

  let nextAssigneeName = "Ingen tildelt";
  if (nextAssigneeId) {
    const users = await listMeetingAssignableUsers();
    const nextAssignee = users.find((u) => u.id === nextAssigneeId);
    if (!nextAssignee) {
      return NextResponse.json({ error: "Brugeren er ikke kørende sælger." }, { status: 400 });
    }
    nextAssigneeName = nextAssignee.name;
  }

  const updated = await prisma.lead.update({
    where: { id },
    data: { assignedUserId: nextAssigneeId },
    select: {
      id: true,
      assignedUser: { select: { id: true, name: true, username: true, phone: true } },
    },
  });

  if (lead.assignedUserId !== nextAssigneeId) {
    await prisma.leadActivityEvent.create({
      data: {
        leadId: lead.id,
        userId: session!.user.id,
        kind: LEAD_ACTIVITY_KIND.MEETING_ASSIGNEE_SET,
        summary: nextAssigneeId ? `Møde tildelt til ${nextAssigneeName}` : "Møde sat til Ingen tildelt",
      },
    });
    // Podio «Sælger» og sælgerens kalender i Allio-Native følger med.
    after(async () => {
      await updateMoedeSellerInPodio(lead.id);
      if (lead.allioBookingId) {
        await ensureAllioNativeBookingForLead(lead.id).catch((err) =>
          console.error("[assign] Native-opdatering fejlede:", err instanceof Error ? err.message : err),
        );
      }
    });
  }

  return NextResponse.json(updated);
}
