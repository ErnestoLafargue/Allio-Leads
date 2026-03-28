import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/api-auth";
import { releaseExpiredLocksEverywhere, refreshLeadLock, releaseLeadLock, tryAcquireLeadLock } from "@/lib/lead-lock";

type Params = { params: Promise<{ id: string }> };

/** POST: prøv at overtage lås (fx fra lead-detalje). */
export async function POST(_req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;
  const id = (await params).id;

  try {
    await releaseExpiredLocksEverywhere(prisma);
    const existing = await prisma.lead.findUnique({
      where: { id },
      select: {
        id: true,
        lockedByUserId: true,
        lockExpiresAt: true,
        lockedAt: true,
        lockedByUser: { select: { name: true, username: true } },
      },
    });
    if (!existing) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });

    const ok = await tryAcquireLeadLock(prisma, id, userId);
    if (!ok) {
      const fresh = await prisma.lead.findUnique({
        where: { id },
        select: {
          lockedByUser: { select: { name: true, username: true } },
          lockExpiresAt: true,
        },
      });
      return NextResponse.json(
        {
          error: "Leadet er optaget af en anden bruger lige nu.",
          lockedBy: fresh?.lockedByUser ?? null,
          lockExpiresAt: fresh?.lockExpiresAt?.toISOString() ?? null,
        },
        { status: 409 },
      );
    }

    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        bookedByUser: { select: { id: true, name: true, username: true } },
        campaign: { select: { id: true, name: true, fieldConfig: true } },
        lockedByUser: { select: { id: true, name: true, username: true } },
      },
    });
    return NextResponse.json({ ok: true, lead });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Kunne ikke låse lead", details: process.env.NODE_ENV === "development" ? msg : undefined },
      { status: 500 },
    );
  }
}

/** PATCH: heartbeat — forlæng lås. */
export async function PATCH(_req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;
  const id = (await params).id;

  try {
    await releaseExpiredLocksEverywhere(prisma);
    const ok = await refreshLeadLock(prisma, id, userId);
    if (!ok) {
      return NextResponse.json({ error: "Kunne ikke forlænge lås (måske overtaget af anden?)" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Kunne ikke opdatere lås", details: process.env.NODE_ENV === "development" ? msg : undefined },
      { status: 500 },
    );
  }
}

/** DELETE: frigiv lås. Admin: ?force=1 fjerner uanset ejer. */
export async function DELETE(req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;
  const id = (await params).id;
  const force = new URL(req.url).searchParams.get("force") === "1";

  try {
    if (force) {
      const { response: adminResp } = await requireAdmin();
      if (adminResp) return adminResp;
      await releaseLeadLock(prisma, id, userId, { admin: true });
      return NextResponse.json({ ok: true });
    }
    await releaseLeadLock(prisma, id, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Kunne ikke frigive lås", details: process.env.NODE_ENV === "development" ? msg : undefined },
      { status: 500 },
    );
  }
}
