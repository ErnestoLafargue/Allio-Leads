import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { parseCustomFields, stringifyCustomFields } from "@/lib/custom-fields";
import { fetchVirkCompanyByCvr, mapVirkParticipantsToLeadFields } from "@/lib/virk-enrichment";
import { canAccessBookedMeetingNotes } from "@/lib/lead-meeting-access";
import { canAccessCallbackLead } from "@/lib/lead-callback-access";
import { sellerMayEditLead } from "@/lib/lead-lock";
import { normalizeCVR } from "@/lib/cvr-import";

type Params = { params: Promise<{ id: string }> };

const FIXED_KEYS = {
  stifter: "stifter",
  direktor: "direktor",
  fuldtAnsvarligPerson: "fuldt_ansvarlig_person",
} as const;

export async function POST(req: Request, { params }: Params) {
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

  const body = await req.json().catch(() => null);
  const cvrFromField = typeof body?.cvr === "string" ? body.cvr : "";
  const cvr = normalizeCVR(cvrFromField);
  if (!cvr) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[VIRK] enrich ${id}: missing_or_invalid_cvr`, { cvrFromField });
    }
    return NextResponse.json({ error: "Gyldigt CVR-nummer mangler" }, { status: 400 });
  }

  let virkPayload: unknown;
  try {
    virkPayload = await fetchVirkCompanyByCvr(cvr);
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[VIRK] enrich ${id}: request_failed`, { cvr, msg });
    }
    return NextResponse.json({ error: "Kunne ikke hente oplysninger fra VIRK" }, { status: 502 });
  }

  const mapped = mapVirkParticipantsToLeadFields(virkPayload);
  if (process.env.NODE_ENV !== "production") {
    console.info(`[VIRK] enrich ${id}: mapped`, {
      cvr,
      hasStifter: Boolean(mapped.stifter),
      hasDirektor: Boolean(mapped.direktor),
      hasFuldtAnsvarligPerson: Boolean(mapped.fuldtAnsvarligPerson),
    });
  }

  const custom = parseCustomFields(lead.customFields);
  const updates: Record<string, string> = {};
  const missingFieldKeys: string[] = [];

  const stifterEmpty = !(custom[FIXED_KEYS.stifter] ?? "").trim();
  const direktorEmpty = !(custom[FIXED_KEYS.direktor] ?? "").trim();
  const fadEmpty = !(custom[FIXED_KEYS.fuldtAnsvarligPerson] ?? "").trim();

  if (mapped.stifter && stifterEmpty) updates[FIXED_KEYS.stifter] = mapped.stifter;
  else if (stifterEmpty) missingFieldKeys.push(FIXED_KEYS.stifter);

  if (mapped.direktor && direktorEmpty) updates[FIXED_KEYS.direktor] = mapped.direktor;
  else if (direktorEmpty) missingFieldKeys.push(FIXED_KEYS.direktor);

  if (mapped.fuldtAnsvarligPerson && fadEmpty) {
    updates[FIXED_KEYS.fuldtAnsvarligPerson] = mapped.fuldtAnsvarligPerson;
  } else if (fadEmpty) {
    missingFieldKeys.push(FIXED_KEYS.fuldtAnsvarligPerson);
  }

  if (Object.keys(updates).length === 0) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[VIRK] enrich ${id}: no_updates`, { cvr, missingFieldKeys });
    }
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
