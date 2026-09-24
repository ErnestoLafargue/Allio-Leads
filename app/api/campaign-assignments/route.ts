import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";
import {
  ASSIGNABLE_DIALER_ROLES,
  campaignIdsAssignedToUser,
  intersectionAssignedUserIds,
} from "@/lib/campaign-access";

/**
 * GET ?campaignIds=a,b → intersection af sælgere tildelt alle angivne kampagner
 * GET ?userId=… → campaignIds for én sælger (inspektion)
 */
export async function GET(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId")?.trim() ?? "";
  const campaignIdsRaw = searchParams.get("campaignIds")?.trim() ?? "";

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, username: true, role: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Bruger findes ikke" }, { status: 404 });
    }
    const campaignIds = await campaignIdsAssignedToUser(userId);
    return NextResponse.json({ user, campaignIds });
  }

  const campaignIds = campaignIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (campaignIds.length === 0) {
    return NextResponse.json({
      campaignIds: [],
      users: [] as { id: string; name: string; username: string; role: string }[],
    });
  }

  const userIds = await intersectionAssignedUserIds(campaignIds);
  const users =
    userIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: userIds }, role: { in: [...ASSIGNABLE_DIALER_ROLES] } },
          select: { id: true, name: true, username: true, role: true },
          orderBy: { name: "asc" },
        });

  return NextResponse.json({ campaignIds, users });
}

/**
 * PUT { campaignIds, userIds, action: "assign" | "unassign" }
 * Bulk: alle kombinationer af kampagner × brugere.
 */
export async function PUT(req: Request) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const action = body?.action === "unassign" ? "unassign" : body?.action === "assign" ? "assign" : null;
  const campaignIds: string[] = Array.isArray(body?.campaignIds)
    ? (body.campaignIds as unknown[])
        .filter((v): v is string => typeof v === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const userIds: string[] = Array.isArray(body?.userIds)
    ? (body.userIds as unknown[])
        .filter((v): v is string => typeof v === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  if (!action) {
    return NextResponse.json({ error: "action skal være assign eller unassign" }, { status: 400 });
  }
  if (campaignIds.length === 0 || userIds.length === 0) {
    return NextResponse.json(
      { error: "Angiv mindst én kampagne og én bruger" },
      { status: 400 },
    );
  }

  const campaigns = await prisma.campaign.findMany({
    where: { id: { in: campaignIds } },
    select: { id: true },
  });
  if (campaigns.length !== campaignIds.length) {
    return NextResponse.json({ error: "En eller flere kampagner findes ikke" }, { status: 404 });
  }

  const assignees = await prisma.user.findMany({
    where: { id: { in: userIds }, role: { in: [...ASSIGNABLE_DIALER_ROLES] } },
    select: { id: true },
  });
  if (assignees.length !== userIds.length) {
    return NextResponse.json(
      { error: "Kun sælgere og administratorer kan tildeles kampagner — tjek bruger-id'er" },
      { status: 400 },
    );
  }

  const createdById = session!.user.id;

  if (action === "unassign") {
    const result = await prisma.campaignAssignment.deleteMany({
      where: {
        campaignId: { in: campaignIds },
        userId: { in: userIds },
      },
    });
    return NextResponse.json({ ok: true, action, removed: result.count });
  }

  const pairs = campaignIds.flatMap((campaignId) =>
    userIds.map((userId) => ({ campaignId, userId, createdById })),
  );

  // createMany skipDuplicates — Prisma understøtter det på Postgres
  const result = await prisma.campaignAssignment.createMany({
    data: pairs,
    skipDuplicates: true,
  });

  return NextResponse.json({ ok: true, action, created: result.count });
}
