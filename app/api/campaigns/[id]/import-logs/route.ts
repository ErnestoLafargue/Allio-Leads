import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { id: campaignId } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Kampagnen findes ikke." }, { status: 404 });
  }

  const logs = await prisma.campaignImportLog.findMany({
    where: { campaignId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      filename: true,
      totalRows: true,
      newLeadsImported: true,
      existingAttached: true,
      overwriteMatchedCvrs: true,
      protectedCvrsSkipped: true,
      replacedLeadsDeleted: true,
      skippedDuplicateInFile: true,
      skippedAlreadyInCampaign: true,
      skippedInvalid: true,
      attachExistingCvrsToCampaign: true,
      importDuplicateCvrs: true,
      overwriteExistingCvrs: true,
      allowMissingCvr: true,
      allowMissingCompanyName: true,
      createdAt: true,
      user: { select: { id: true, name: true, username: true } },
    },
  });

  return NextResponse.json({
    logs: logs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
    })),
  });
}
