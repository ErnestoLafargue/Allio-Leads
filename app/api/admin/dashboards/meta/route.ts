import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  GROUP_BY_LABELS,
  METRIC_CATALOG,
  PERIOD_LABELS,
  VIZ_LABELS,
} from "@/lib/dashboard/metric-catalog";

/** GET /api/admin/dashboards/meta — katalog + filtre til builder */
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const [users, campaigns] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["SELLER", "ADMIN"] } },
      select: { id: true, name: true, username: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.campaign.findMany({
      select: { id: true, name: true, isSystemCampaign: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({
    metrics: METRIC_CATALOG,
    periodLabels: PERIOD_LABELS,
    groupByLabels: GROUP_BY_LABELS,
    vizLabels: VIZ_LABELS,
    users,
    campaigns,
  });
}

export const runtime = "nodejs";
