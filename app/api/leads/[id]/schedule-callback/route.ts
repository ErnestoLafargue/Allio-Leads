import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { LEAD_LOCK_CLEAR, isLockActive } from "@/lib/lead-lock";
import { isCallbackTimeInCopenhagenBusinessWindow } from "@/lib/callback-datetime";
import { parseCustomFields, stringifyCustomFields } from "@/lib/custom-fields";
import { normalizeLeaderboardOutcomeStatus } from "@/lib/lead-outcome-log";

type Params = { params: Promise<{ id: string }> };

const leadInclude = {
  bookedByUser: { select: { id: true, name: true, username: true } as const },
  campaign: { select: { id: true, name: true, fieldConfig: true } as const },
  lockedByUser: { select: { id: true, name: true, username: true } as const },
  callbackReservedByUser: { select: { id: true, name: true, username: true } as const },
  callbackCreatedByUser: { select: { id: true, name: true, username: true } as const },
} as const;

/**
 * Planlæg genopkald: status CALLBACK_SCHEDULED, reservation til kalder, frigør kortvarigt lås.
 */
export async function POST(req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id } = await params;
  const userId = session.user.id;

  const body = await req.json().catch(() => null);
  const scheduledRaw = body?.scheduledFor;
  if (typeof scheduledRaw !== "string") {
    return NextResponse.json({ error: "Angiv «scheduledFor» som ISO-dato og -tid." }, { status: 400 });
  }
  const scheduledFor = new Date(scheduledRaw.trim());
  if (Number.isNaN(scheduledFor.getTime())) {
    return NextResponse.json({ error: "Ugyldig dato." }, { status: 400 });
  }

  let assignedUserId = typeof body?.assignedUserId === "string" ? body.assignedUserId.trim() : userId;

  const assignee = await prisma.user.findUnique({ where: { id: assignedUserId }, select: { id: true } });
  if (!assignee) {
    return NextResponse.json({ error: "Ukendt bruger til tildeling." }, { status: 400 });
  }

  const now = new Date();
  const minFuture = new Date(now.getTime() - 60_000);
  if (scheduledFor.getTime() <= minFuture.getTime()) {
    return NextResponse.json(
      { error: "Vælg et tidspunkt i fremtiden (mindst ét minut fra nu)." },
      { status: 400 },
    );
  }
  if (!isCallbackTimeInCopenhagenBusinessWindow(scheduledFor)) {
    return NextResponse.json(
      { error: "Tilbagekald skal ligge mellem kl. 08:00 og 22:00 (København)." },
      { status: 400 },
    );
  }

  try {
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });

    const isReschedule =
      lead.status === "CALLBACK_SCHEDULED" &&
      String(lead.callbackStatus ?? "").trim().toUpperCase() === "PENDING";
    if (!isReschedule && lead.status !== "NEW") {
      return NextResponse.json(
        { error: "Callback kan kun planlægges fra et «Ny»-lead i kampagnekøen." },
        { status: 400 },
      );
    }

    const role = session.user.role;
    if (role !== "ADMIN") {
      if (
        isReschedule
          ? lead.callbackReservedByUserId !== userId
          : !isLockActive(lead, now) || lead.lockedByUserId !== userId
      ) {
        return NextResponse.json(
          {
            error: isReschedule
              ? "Kun den tildelte bruger eller admin kan flytte dette tilbagekald."
              : "Du skal have leadet aktivt i kampagne-arbejdet (låst til dig) for at planlægge callback.",
          },
          { status: 403 },
        );
      }
    }

    const customFromBody =
      body?.customFields && typeof body.customFields === "object" && body.customFields !== null
        ? (body.customFields as Record<string, unknown>)
        : null;
    const mergedCustom = customFromBody
      ? stringifyCustomFields({
          ...parseCustomFields(lead.customFields),
          ...Object.fromEntries(
            Object.entries(customFromBody).map(([k, v]) => [k, typeof v === "string" ? v : String(v ?? "")]),
          ),
        })
      : lead.customFields;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.lead.update({
      where: { id },
      data: {
        companyName: typeof body?.companyName === "string" ? body.companyName.trim() : lead.companyName,
        phone: typeof body?.phone === "string" ? body.phone.trim() : lead.phone,
        email: typeof body?.email === "string" ? body.email : lead.email,
        cvr: typeof body?.cvr === "string" ? body.cvr : lead.cvr,
        address: typeof body?.address === "string" ? body.address : lead.address,
        postalCode: typeof body?.postalCode === "string" ? body.postalCode : lead.postalCode,
        city: typeof body?.city === "string" ? body.city : lead.city,
        industry: typeof body?.industry === "string" ? body.industry : lead.industry,
        notes: typeof body?.notes === "string" ? body.notes : lead.notes,
        customFields: mergedCustom,
        meetingContactName:
          typeof body?.meetingContactName === "string"
            ? body.meetingContactName.trim()
            : lead.meetingContactName,
        meetingContactEmail:
          typeof body?.meetingContactEmail === "string"
            ? body.meetingContactEmail.trim()
            : lead.meetingContactEmail,
        meetingContactPhonePrivate:
          typeof body?.meetingContactPhonePrivate === "string"
            ? body.meetingContactPhonePrivate.trim()
            : lead.meetingContactPhonePrivate,
        status: "CALLBACK_SCHEDULED",
        callbackScheduledFor: scheduledFor,
        callbackReservedByUserId: assignedUserId,
        callbackCreatedByUserId: lead.callbackCreatedByUserId ?? userId,
        callbackStatus: "PENDING",
        callbackNote: lead.callbackNote ?? "",
        callbackSeenByAssigneeAt: null,
        ...LEAD_LOCK_CLEAR,
      },
      include: leadInclude,
    });
      if (!isReschedule) {
        await tx.leadOutcomeLog.create({
          data: {
            leadId: id,
            userId,
            status: normalizeLeaderboardOutcomeStatus("CALLBACK_SCHEDULED"),
          },
        });
      }
      return u;
    });

    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const migrationHint =
      msg.includes("callbackScheduledFor") ||
      msg.includes("callbackReservedByUserId") ||
      msg.includes("callbackStatus") ||
      msg.includes("callbackCreatedByUserId") ||
      msg.includes("callbackSeenByAssigneeAt") ||
      msg.includes("no such column") ||
      msg.toLowerCase().includes("does not exist");
    return NextResponse.json(
      {
        error: migrationHint
          ? "Databasen mangler callback-kolonner. Kør «npx prisma migrate deploy» og genstart serveren."
          : "Kunne ikke planlægge callback.",
        details: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    );
  }
}
