import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { generateDashboardPublicToken } from "@/lib/dashboard/public-token";
import { parseDashboardLayout, parseDashboardWidgets } from "@/lib/dashboard/parse-config";

type Params = { params: Promise<{ id: string }> };

/** POST /api/admin/dashboards/[id]/duplicate — kopier dashboard med nyt token */
export async function POST(_req: Request, { params }: Params) {
  const { session, response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;

  const source = await prisma.dashboard.findUnique({ where: { id } });
  if (!source) return NextResponse.json({ error: "Dashboard findes ikke" }, { status: 404 });

  const created = await prisma.dashboard.create({
    data: {
      name: `${source.name} (kopi)`,
      description: source.description,
      publicToken: generateDashboardPublicToken(),
      publicEnabled: source.publicEnabled,
      refreshSeconds: source.refreshSeconds,
      layout: parseDashboardLayout(source.layout),
      widgets: parseDashboardWidgets(source.widgets),
      createdById: session!.user.id,
    },
  });

  return NextResponse.json({
    dashboard: {
      id: created.id,
      name: created.name,
      publicToken: created.publicToken,
      publicPath: `/d/${created.publicToken}`,
    },
  });
}

export const runtime = "nodejs";
