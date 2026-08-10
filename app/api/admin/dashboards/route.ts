import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { generateDashboardPublicToken } from "@/lib/dashboard/public-token";
import { parseDashboardLayout, parseDashboardWidgets } from "@/lib/dashboard/parse-config";

/**
 * GET /api/admin/dashboards — list alle dashboards
 * POST /api/admin/dashboards — opret nyt dashboard { name, description? }
 */
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const rows = await prisma.dashboard.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      publicToken: true,
      publicEnabled: true,
      refreshSeconds: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    dashboards: rows.map((d) => ({
      ...d,
      publicPath: `/d/${d.publicToken}`,
      widgetCount: undefined as number | undefined,
    })),
  });
}

export async function POST(req: Request) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 120) {
    return NextResponse.json({ error: "Navn er påkrævet (max 120 tegn)" }, { status: 400 });
  }
  const description =
    typeof body?.description === "string" && body.description.trim()
      ? body.description.trim().slice(0, 500)
      : null;

  const created = await prisma.dashboard.create({
    data: {
      name,
      description,
      publicToken: generateDashboardPublicToken(),
      publicEnabled: true,
      refreshSeconds: 30,
      layout: [],
      widgets: [],
      createdById: session!.user.id,
    },
  });

  return NextResponse.json({
    dashboard: {
      id: created.id,
      name: created.name,
      description: created.description,
      publicToken: created.publicToken,
      publicEnabled: created.publicEnabled,
      publicPath: `/d/${created.publicToken}`,
      refreshSeconds: created.refreshSeconds,
      layout: parseDashboardLayout(created.layout),
      widgets: parseDashboardWidgets(created.widgets),
    },
  });
}

export const runtime = "nodejs";
