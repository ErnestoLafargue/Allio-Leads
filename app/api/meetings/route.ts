import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";

export async function GET() {
  const { response } = await requireSession();
  if (response) return response;

  const meetings = await prisma.lead.findMany({
    where: { status: "MEETING_BOOKED" },
    orderBy: { meetingScheduledFor: "asc" },
    include: {
      bookedByUser: { select: { id: true, name: true, username: true } },
      campaign: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(meetings);
}
