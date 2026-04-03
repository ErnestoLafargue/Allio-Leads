import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { parseCustomFields, stringifyCustomFields } from "@/lib/custom-fields";
import { parseFieldConfig, resolveFixedPersonFieldKeys } from "@/lib/campaign-fields";
import { fetchVirkCompanyByCvr, mapVirkParticipantsToLeadFields } from "@/lib/virk-enrichment";
import { canAccessBookedMeetingNotes } from "@/lib/lead-meeting-access";
import { canAccessCallbackLead } from "@/lib/lead-callback-access";
import { sellerMayEditLead } from "@/lib/lead-lock";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;

  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: { campaign: { select: { fieldConfig: true } } },
  });
  if (!lead) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });

  if (!canAccessBookedMeetingNotes(session.user.role, session.user.id, lead)) {
    return NextResponse.json({ error: "Du har ikke adgang til at berige dette lead." }, { status: 403 });
  }
  if (!canAccessCallbackLead(session.user.role, session.user.id, lead)) {
    return NextResponse.json({ error: "Du har ikke adgang til at berige dette lead." }, { status: 403 });
  }
  if (!sellerMayEditLead(session.user.role, session.user.id, lead)) {
    return NextResponse.json({ error: "Leadet er låst af en anden bruger." }, { status: 409 });
  }

  if (!lead.cvr?.trim()) {
    return NextResponse.json({ error: "CVR-nummer mangler eller er ugyldigt" }, { status: 400 });
  }

  let virkPayload: unknown;
  try {
    virkPayload = await fetchVirkCompanyByCvr(lead.cvr);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("ugyldigt") ? 400 : 502;
    return NextResponse.json({ error: status === 400 ? msg : "Kunne ikke hente oplysninger fra VIRK" }, { status });
  }

  const mapped = mapVirkParticipantsToLeadFields(virkPayload);
  const fieldCfg = parseFieldConfig(lead.campaign?.fieldConfig ?? "{}");
  const keys = resolveFixedPersonFieldKeys(fieldCfg);

  const custom = parseCustomFields(lead.customFields);
  const updates: Record<string, string> = {};
  const missingFieldKeys: string[] = [];

  const stifterEmpty = !(custom[keys.stifter] ?? "").trim();
  const direktorEmpty = !(custom[keys.direktor] ?? "").trim();
  const fadEmpty = !(custom[keys.fuldtAnsvarligPerson] ?? "").trim();

  if (mapped.stifter && stifterEmpty) updates[keys.stifter] = mapped.stifter;
  else if (stifterEmpty) missingFieldKeys.push(keys.stifter);

  if (mapped.direktor && direktorEmpty) updates[keys.direktor] = mapped.direktor;
  else if (direktorEmpty) missingFieldKeys.push(keys.direktor);

  if (mapped.fuldtAnsvarligPerson && fadEmpty) updates[keys.fuldtAnsvarligPerson] = mapped.fuldtAnsvarligPerson;
  else if (fadEmpty) missingFieldKeys.push(keys.fuldtAnsvarligPerson);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({
      ok: true,
      updatedFields: {},
      missingFieldKeys,
      message: "Ingen relevante personoplysninger fundet i VIRK",
    });
  }

  const mergedCustom = { ...custom, ...updates };
  const updatedLead = await prisma.lead.update({
    where: { id: lead.id },
    data: { customFields: stringifyCustomFields(mergedCustom) },
    include: {
      campaign: { select: { id: true, name: true, fieldConfig: true } },
      bookedByUser: { select: { id: true, name: true, username: true } },
      lockedByUser: { select: { id: true, name: true, username: true } },
      callbackReservedByUser: { select: { id: true, name: true, username: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    updatedFields: updates,
    missingFieldKeys,
    message: "Berigelse gennemført",
    lead: updatedLead,
  });
}
