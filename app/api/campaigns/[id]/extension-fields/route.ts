import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";
import {
  FIELD_GROUPS,
  parseFieldConfig,
  serializeFieldConfig,
  slugifyKey,
  type FieldGroupKey,
} from "@/lib/campaign-fields";

type Params = { params: Promise<{ id: string }> };

function isFieldGroupKey(v: string): v is FieldGroupKey {
  return (FIELD_GROUPS as readonly string[]).includes(v);
}

export async function POST(req: Request, { params }: Params) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Kampagne ikke fundet" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const groupRaw = typeof body?.group === "string" ? body.group : "";
  if (!label) {
    return NextResponse.json({ error: "Angiv et navn til feltet" }, { status: 400 });
  }
  if (!isFieldGroupKey(groupRaw)) {
    return NextResponse.json({ error: "Ugyldig feltgruppe" }, { status: 400 });
  }
  const group = groupRaw;

  const cfg = parseFieldConfig(campaign.fieldConfig);
  const used = new Set<string>();
  for (const g of FIELD_GROUPS) {
    for (const f of cfg.extensions[g] ?? []) {
      used.add(f.key);
    }
  }
  const key = slugifyKey(label, used);

  const list = [...(cfg.extensions[group] ?? []), { key, label }];
  cfg.extensions[group] = list;

  const fieldConfigStr = serializeFieldConfig(cfg);
  const updated = await prisma.campaign.update({
    where: { id },
    data: { fieldConfig: fieldConfigStr },
    select: { id: true, fieldConfig: true, updatedAt: true },
  });

  return NextResponse.json({
    key,
    fieldConfig: updated.fieldConfig,
  });
}
