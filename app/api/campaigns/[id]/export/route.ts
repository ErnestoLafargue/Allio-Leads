import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import {
  buildExportRows,
  exportFilenameBase,
  generateCampaignCsv,
  generateCampaignXlsx,
} from "@/lib/campaign-export";

type Params = { params: Promise<{ id: string }> };

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (session!.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Kun administrator" }, { status: 403 });
  }

  const { id: campaignId } = await params;
  const { searchParams } = new URL(req.url);
  const format = (searchParams.get("format") ?? "xlsx").toLowerCase().trim();
  if (format !== "csv" && format !== "xlsx") {
    return NextResponse.json({ error: "Angiv format=csv eller format=xlsx" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      name: true,
      fieldConfig: true,
      systemCampaignType: true,
    },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Kampagne ikke fundet" }, { status: 404 });
  }

  const leads = await prisma.lead.findMany({
    where: { campaignId },
    orderBy: { importedAt: "desc" },
    include: {
      bookedByUser: { select: { name: true, username: true } },
      callbackReservedByUser: { select: { name: true, username: true } },
      callbackCreatedByUser: { select: { name: true, username: true } },
      lockedByUser: { select: { name: true, username: true } },
      _count: { select: { outcomeLogs: true } },
      outcomeLogs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, status: true },
      },
    },
  });

  const { headers, rows } = buildExportRows(leads, campaign.fieldConfig);
  const base = exportFilenameBase(campaign.name);

  if (format === "csv") {
    const buf = generateCampaignCsv(headers, rows);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDisposition(`${base}.csv`),
      },
    });
  }

  const buf = generateCampaignXlsx(headers, rows);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(`${base}.xlsx`),
    },
  });
}
