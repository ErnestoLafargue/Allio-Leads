import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  applyAllioOsOutcome,
  parseAllioOsOutcome,
  verifyAllioOsSignature,
} from "@/lib/allio-os/meeting-outcome";

export const runtime = "nodejs";

/**
 * POST /api/integrations/allio-os/meeting-outcome
 * Allio OS sender mødeudfaldet, når en sælger sætter det under Salg: { lead_id, outcome }.
 * Signeret med ALLIO_OS_LEADS_SECRET (headers x-allio-os-timestamp og x-allio-os-signature).
 */
export async function POST(req: Request) {
  const secret = (process.env.ALLIO_OS_LEADS_SECRET ?? "").trim();
  if (!secret) {
    console.error("[allio-os-outcome] ALLIO_OS_LEADS_SECRET mangler");
    return NextResponse.json({ error: "Ikke konfigureret" }, { status: 503 });
  }

  const rawBody = await req.text();
  const ok = verifyAllioOsSignature({
    rawBody,
    timestamp: req.headers.get("x-allio-os-timestamp") ?? "",
    signature: req.headers.get("x-allio-os-signature") ?? "",
    secret,
  });
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { lead_id?: unknown; outcome?: unknown };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }
  const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
  const outcome = parseAllioOsOutcome(body.outcome);
  if (!leadId || outcome === undefined) {
    return NextResponse.json({ error: "lead_id og outcome er påkrævet" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const changed = await applyAllioOsOutcome(leadId, outcome);
  return NextResponse.json({ ok: true, changed });
}
