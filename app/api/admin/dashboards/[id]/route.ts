import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { generateDashboardPublicToken } from "@/lib/dashboard/public-token";
import { parseDashboardLayout, parseDashboardWidgets } from "@/lib/dashboard/parse-config";
import { computeDashboardWidgetResults } from "@/lib/dashboard/compute-dashboard-metrics";
import { getMetricDefinition } from "@/lib/dashboard/metric-catalog";
import type { DashboardLayoutItem, DashboardWidgetConfig } from "@/lib/dashboard/types";

type Params = { params: Promise<{ id: string }> };

function serialize(d: {
  id: string;
  name: string;
  description: string | null;
  publicToken: string;
  publicEnabled: boolean;
  refreshSeconds: number;
  layout: unknown;
  widgets: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    publicToken: d.publicToken,
    publicEnabled: d.publicEnabled,
    publicPath: `/d/${d.publicToken}`,
    refreshSeconds: d.refreshSeconds,
    layout: parseDashboardLayout(d.layout),
    widgets: parseDashboardWidgets(d.widgets),
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export async function GET(_req: Request, { params }: Params) {
  const { response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;

  const d = await prisma.dashboard.findUnique({ where: { id } });
  if (!d) return NextResponse.json({ error: "Dashboard findes ikke" }, { status: 404 });

  const widgets = parseDashboardWidgets(d.widgets);
  const results = await computeDashboardWidgetResults(widgets);

  return NextResponse.json({ dashboard: serialize(d), results });
}

export async function PATCH(req: Request, { params }: Params) {
  const { response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;

  const existing = await prisma.dashboard.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Dashboard findes ikke" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Ugyldigt body" }, { status: 400 });
  }

  const data: {
    name?: string;
    description?: string | null;
    publicEnabled?: boolean;
    refreshSeconds?: number;
    layout?: DashboardLayoutItem[];
    widgets?: DashboardWidgetConfig[];
    publicToken?: string;
  } = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name || name.length > 120) {
      return NextResponse.json({ error: "Ugyldigt navn" }, { status: 400 });
    }
    data.name = name;
  }
  if ("description" in body) {
    data.description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim().slice(0, 500)
        : null;
  }
  if (typeof body.publicEnabled === "boolean") data.publicEnabled = body.publicEnabled;
  if (typeof body.refreshSeconds === "number" && Number.isFinite(body.refreshSeconds)) {
    data.refreshSeconds = Math.min(300, Math.max(10, Math.round(body.refreshSeconds)));
  }
  if (Array.isArray(body.layout)) data.layout = parseDashboardLayout(body.layout);
  if (Array.isArray(body.widgets)) {
    const widgets = parseDashboardWidgets(body.widgets);
    for (const w of widgets) {
      if (!getMetricDefinition(w.metricId)) {
        return NextResponse.json({ error: `Ukendt metrik: ${w.metricId}` }, { status: 400 });
      }
    }
    data.widgets = widgets;
  }
  if (body.rotatePublicToken === true) {
    data.publicToken = generateDashboardPublicToken();
  }

  const updated = await prisma.dashboard.update({
    where: { id },
    data: {
      ...data,
      ...(data.layout ? { layout: data.layout } : {}),
      ...(data.widgets ? { widgets: data.widgets } : {}),
    },
  });

  return NextResponse.json({ dashboard: serialize(updated) });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;

  try {
    await prisma.dashboard.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Dashboard findes ikke" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
export const maxDuration = 60;
