import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { ensureSystemCampaignId } from "@/lib/ensure-system-campaigns";
import { listMeetingAssignableUsers } from "@/lib/meeting-assignee";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const assignedUserId = typeof body?.assignedUserId === "string" ? body.assignedUserId.trim() : "";
  if (!assignedUserId) {
    return NextResponse.json({ error: "Vælg en bruger at tildele mødet til." }, { status: 400 });
  }

  const campaignId = await ensureSystemCampaignId("upcoming_meetings");
  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, status: true, campaignId: true, assignedUserId: true, companyName: true },
  });
  if (!lead || lead.status !== "MEETING_BOOKED" || lead.campaignId !== campaignId) {
    return NextResponse.json({ error: "Mødet blev ikke fundet i Kommende møder." }, { status: 404 });
  }

  const users = await listMeetingAssignableUsers();
  const nextAssignee = users.find((u) => u.id === assignedUserId);
  if (!nextAssignee) {
    return NextResponse.json({ error: "Brugeren kan ikke tildeles møder (mangler telefonnummer)." }, { status: 400 });
  }

  const updated = await prisma.lead.update({
    where: { id },
    data: { assignedUserId: nextAssignee.id },
    select: {
      id: true,
      assignedUser: { select: { id: true, name: true, username: true, phone: true } },
    },
  });

  if (lead.assignedUserId !== nextAssignee.id) {
    await prisma.leadActivityEvent.create({
      data: {
        leadId: lead.id,
        userId: session!.user.id,
        kind: LEAD_ACTIVITY_KIND.MEETING_ASSIGNEE_SET,
        summary: `Møde tildelt til ${nextAssignee.name}`,
      },
    });
  }

  return NextResponse.json(updated);
}

