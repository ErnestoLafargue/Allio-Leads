import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/api-auth";
import { parseFieldConfig, serializeFieldConfig } from "@/lib/campaign-fields";
import {
  canDeleteCampaign,
  PROTECTED_CAMPAIGN_DELETE_MESSAGE,
} from "@/lib/campaign-delete";
import { workableCampaignLeadsWhere } from "@/lib/campaign-workable-leads";
import { DIAL_MODES, normalizeCampaignDialMode, type CampaignDialMode } from "@/lib/dial-mode";
import { parseMaxContactAttemptsInput, parseUnansweredCooldownHoursInput } from "@/lib/lead-attempts";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;

  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      fieldConfig: true,
      activeQueueFilter: true,
      includeProtectedBusinesses: true,
      includeLeadsWithoutPhone: true,
      isSystemCampaign: true,
      systemCampaignType: true,
      dialMode: true,
      maxContactAttempts: true,
      unansweredCooldownHours: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          leads: { where: workableCampaignLeadsWhere },
        },
      },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });
  if (
    campaign.systemCampaignType === "active_customers" &&
    session!.user.role !== "ADMIN"
  ) {
    return NextResponse.json(
      { error: "Kun administratorer har adgang til «Aktive kunder»." },
      { status: 403 },
    );
  }

  const totalWorkableLeads = campaign._count.leads;
  const eligibleForDialing =
    campaign.maxContactAttempts != null
      ? await prisma.lead.count({
          where: {
            campaignId: id,
            ...workableCampaignLeadsWhere,
            unansweredAttempts: { lte: campaign.maxContactAttempts },
          },
        })
      : null;

  return NextResponse.json({
    ...campaign,
    contactAttemptStats: {
      totalWorkableLeads,
      eligibleForDialing,
    },
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const existing = await prisma.campaign.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      isSystemCampaign: true,
      systemCampaignType: true,
    },
  });
  if (!existing) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });

  if (!canDeleteCampaign(existing)) {
    return NextResponse.json({ error: PROTECTED_CAMPAIGN_DELETE_MESSAGE }, { status: 403 });
  }

  try {
    await prisma.campaign.delete({ where: { id } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: "Kunne ikke slette kampagne.",
        details: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
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

  let includeLeadsWithoutPhone = existing.includeLeadsWithoutPhone;
  if (typeof body?.includeLeadsWithoutPhone === "boolean") {
    includeLeadsWithoutPhone = body.includeLeadsWithoutPhone;
  }

  let dialMode: CampaignDialMode = normalizeCampaignDialMode(existing.dialMode);
  if (typeof body?.dialMode === "string") {
    const next = normalizeCampaignDialMode(body.dialMode);
    if (!DIAL_MODES.includes(next)) {
      return NextResponse.json({ error: "Ugyldig dial mode" }, { status: 400 });
    }
    dialMode = next;
  }

  let maxContactAttempts: number | null = existing.maxContactAttempts;
  if (body?.maxContactAttempts !== undefined) {
    const parsed = parseMaxContactAttemptsInput(body.maxContactAttempts);
    if (body.maxContactAttempts !== null && body.maxContactAttempts !== "" && parsed === null) {
      return NextResponse.json(
        { error: "Max kontaktforsøg skal være et heltal ≥ 0, eller tom for ingen grænse." },
        { status: 400 },
      );
    }
    maxContactAttempts = parsed;
  }

  let unansweredCooldownHours = existing.unansweredCooldownHours;
  if (body?.unansweredCooldownHours !== undefined) {
    const parsed = parseUnansweredCooldownHoursInput(body.unansweredCooldownHours);
    if (parsed === null) {
      return NextResponse.json(
        { error: "Cooldown skal være et heltal på mindst 1 time." },
        { status: 400 },
      );
    }
    unansweredCooldownHours = parsed;
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
    data: {
      name,
      fieldConfig: fieldConfigStr,
      includeProtectedBusinesses,
      includeLeadsWithoutPhone,
      dialMode,
      maxContactAttempts,
      unansweredCooldownHours,
    },
    select: {
      id: true,
      name: true,
      fieldConfig: true,
      includeProtectedBusinesses: true,
      includeLeadsWithoutPhone: true,
      dialMode: true,
      maxContactAttempts: true,
      unansweredCooldownHours: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(campaign);
}
