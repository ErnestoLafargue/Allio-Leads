import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/api-auth";
import { parseFieldConfig, serializeFieldConfig } from "@/lib/campaign-fields";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { response } = await requireSession();
  if (response) return response;

  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      fieldConfig: true,
      includeProtectedBusinesses: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { leads: true } },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });
  return NextResponse.json(campaign);
}

export async function PATCH(req: Request, { params }: Params) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : existing.name;

  let includeProtectedBusinesses = existing.includeProtectedBusinesses;
  if (typeof body?.includeProtectedBusinesses === "boolean") {
    includeProtectedBusinesses = body.includeProtectedBusinesses;
  }

  let fieldConfigStr = existing.fieldConfig;
  if (body?.fieldConfig !== undefined) {
    const raw =
      typeof body.fieldConfig === "string"
        ? body.fieldConfig
        : JSON.stringify(body.fieldConfig);
    const normalized = parseFieldConfig(raw);
    if (!normalized.extensions || typeof normalized.extensions !== "object") {
      return NextResponse.json({ error: "Ugyldig fieldConfig" }, { status: 400 });
    }
    fieldConfigStr = serializeFieldConfig(normalized);
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data: { name, fieldConfig: fieldConfigStr, includeProtectedBusinesses },
    select: {
      id: true,
      name: true,
      fieldConfig: true,
      includeProtectedBusinesses: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(campaign);
}
