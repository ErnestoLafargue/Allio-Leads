import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidDashboardPublicToken } from "@/lib/dashboard/public-token";
import { parseDashboardLayout, parseDashboardWidgets } from "@/lib/dashboard/parse-config";
import { computeDashboardWidgetResults } from "@/lib/dashboard/compute-dashboard-metrics";

type Params = { params: Promise<{ token: string }> };

/**
 * GET /api/public/d/[token]
 * Read-only aggregater til TV-dashboard. Kræver gyldigt publicToken + publicEnabled.
 * Ingen session — eksponerer ikke lead-PII.
 */
export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;
  if (!isValidDashboardPublicToken(token)) {
    return NextResponse.json({ error: "Ugyldigt link" }, { status: 404 });
  }

  const d = await prisma.dashboard.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      name: true,
      description: true,
      publicEnabled: true,
      refreshSeconds: true,
      layout: true,
      widgets: true,
    },
  });

  if (!d || !d.publicEnabled) {
    return NextResponse.json({ error: "Dashboard findes ikke eller er deaktiveret" }, { status: 404 });
  }

  const widgets = parseDashboardWidgets(d.widgets);
  const layout = parseDashboardLayout(d.layout);
  const results = await computeDashboardWidgetResults(widgets);

  return NextResponse.json({
    id: d.id,
    name: d.name,
    description: d.description,
    refreshSeconds: d.refreshSeconds,
    layout,
    widgets,
    results,
    generatedAt: new Date().toISOString(),
  });
}

export const runtime = "nodejs";
export const maxDuration = 60;
