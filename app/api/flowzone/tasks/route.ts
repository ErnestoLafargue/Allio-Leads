import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveFlowZoneUser } from "@/lib/flowzone/flowzone-user";

/** GET /api/flowzone/tasks?userId= — alle opgaver i brugerens FlowZone. */
export async function GET(req: Request) {
  const { userId, response } = await resolveFlowZoneUser(req);
  if (response) return response;

  const rows = await prisma.flowZoneTask.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { data: true } });
  return NextResponse.json({ tasks: rows.map((r) => r.data) }, { headers: { "Cache-Control": "no-store" } });
}

type Changes = { upserts?: Array<{ id: string } & Record<string, unknown>>; deletes?: string[] };

/**
 * POST /api/flowzone/tasks?userId= — gemmer kun de opgaver der er ændret siden sidst og sletter de fjernede,
 * så to der kigger på samme FlowZone ikke overskriver hinandens øvrige opgaver.
 */
export async function POST(req: Request) {
  const { userId, response } = await resolveFlowZoneUser(req);
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Changes | null;
  const upserts = (body?.upserts ?? []).filter((t) => typeof t?.id === "string" && t.id);
  const deletes = (body?.deletes ?? []).filter((id) => typeof id === "string");

  await prisma.$transaction([
    ...upserts.map((task) => {
      const data = task as unknown as Prisma.InputJsonValue;
      return prisma.flowZoneTask.upsert({
        where: { userId_id: { userId, id: task.id } },
        create: { userId, id: task.id, data },
        update: { data },
      });
    }),
    ...(deletes.length ? [prisma.flowZoneTask.deleteMany({ where: { userId, id: { in: deletes } } })] : []),
  ]);
  return NextResponse.json({ ok: true });
}
