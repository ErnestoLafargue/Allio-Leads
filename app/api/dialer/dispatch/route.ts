import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import {
  dialTelnyxOutbound,
  getTelnyxConnectionId,
  pickTelnyxFromNumber,
  type AmdConfig,
} from "@/lib/telnyx-call-control";
import { campaignUsesVoipUi, normalizeCampaignDialMode } from "@/lib/dial-mode";
import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";
import { encodeDialerClientState, PRESENCE_FRESH_WINDOW_MS, QUEUE_RESERVATION_TTL_MS } from "@/lib/dialer-shared";

/**
 * Server-side parallel dialer — placerer N udgående opkald baseret på antal ledige agenter
 * og pacing-ratio. AMD aktiveret pr. opkald så svaremaskiner droppes automatisk.
 *
 * POST {
 *   campaignId: string,
 *   maxNewCalls?: number,   // override af pacing-beregning (default: auto)
 *   amd?: "premium" | "detect" | "off"  // default "premium" (Telnyx-feltværdier)
 * }
 *
 * Returnerer:
 *   { ok: true, dispatched: N, attempted: N, ready: agentCount, inFlight: callCount, errors: [] }
 *
 * Idempotens: kan kaldes hyppigt — hver call tjekker reelle in-flight tællinger og
 * placerer kun nye hvis der er kapacitet. DialerQueueItem.leadId er unique så samme
 * lead aldrig dispatches to gange samtidig.
 *
 * Kaldes typisk fra workspace heartbeat (hver 5 sek) eller fra en cron-trigger.
 */

const DEFAULT_AMD: AmdConfig = {
  mode: "premium",
  totalAnalysisTimeMs: 3500,
  afterGreetingSilenceMs: 800,
  greetingTotalAnalysisTimeMs: 3500,
};

/**
 * Pacing-ratio: hvor mange opkald pr. ledig agent vi gerne vil have i luften samtidigt.
 * - POWER_DIALER: 1.0 (sekventielt, men næste lead placeres straks)
 * - PREDICTIVE:   3.0 (3 numre i luften pr. ledig agent — typisk 2-3 svarer ikke)
 *
 * Justeres automatisk hvis abandon rate stiger (TODO: pacing-justering i senere fase).
 */
function targetPacingRatio(dialMode: string): number {
  if (dialMode === "PREDICTIVE") return 3.0;
  if (dialMode === "POWER_DIALER") return 1.0;
  return 0;
}

/**
 * Hard cap på antal samtidige in-flight opkald pr. kampagne uanset agent-tæl.
 * Beskytter mod runaway-dispatch hvis presence-data er forkert. Kan tunes senere.
 */
const MAX_IN_FLIGHT_PER_CAMPAIGN = 50;

export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  const maxNewCallsOverride =
    typeof body?.maxNewCalls === "number" && body.maxNewCalls > 0
      ? Math.min(Math.floor(body.maxNewCalls), 20)
      : null;
  const amdMode: "premium" | "detect" | "off" =
    body?.amd === "off" || body?.amd === "detect" ? body.amd : "premium";

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId er påkrævet" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, dialMode: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Kampagne findes ikke" }, { status: 404 });
  }
  const mode = normalizeCampaignDialMode(campaign.dialMode);
  if (!campaignUsesVoipUi(mode)) {
    return NextResponse.json(
      { error: "Kampagnen er ikke sat til et opkalds-mode (VoIP)." },
      { status: 409 },
    );
  }

  const apiKey = process.env.TELNYX_API_KEY?.trim();
  const connectionId = getTelnyxConnectionId();
  if (!apiKey || !connectionId) {
    return NextResponse.json(
      {
        code: "TELNYX_NOT_CONFIGURED",
        error: "TELNYX_API_KEY eller TELNYX_CONNECTION_ID mangler.",
      },
      { status: 503 },
    );
  }

  // 1) Tæl ledige agenter (ready, frisk heartbeat) — agenter med SIP-username
  const cutoff = new Date(Date.now() - PRESENCE_FRESH_WINDOW_MS);
  const readyAgents = await prisma.agentSession.findMany({
    where: {
      campaignId,
      status: "ready",
      lastHeartbeat: { gte: cutoff },
    },
    include: {
      user: { select: { telnyxSipUsername: true, telnyxCredentialId: true } },
    },
  });
  const provisionedReady = readyAgents.filter(
    (s) => s.user.telnyxSipUsername && s.user.telnyxCredentialId,
  );
  const readyCount = provisionedReady.length;

  // 2) Tæl in-flight lead-opkald
  const inFlightCalls = await prisma.dialerCallLog.count({
    where: {
      campaignId,
      direction: "outbound-lead",
      state: { in: ["initiated", "ringing", "answered"] },
      endedAt: null,
    },
  });

  if (readyCount === 0) {
    return NextResponse.json({
      ok: true,
      dispatched: 0,
      attempted: 0,
      ready: 0,
      inFlight: inFlightCalls,
      reason: "Ingen ledige agenter (provisioneret + ready + frisk heartbeat).",
    });
  }

  // 3) Beregn antal nye opkald
  const ratio = targetPacingRatio(mode);
  if (ratio <= 0) {
    return NextResponse.json({
      ok: true,
      dispatched: 0,
      attempted: 0,
      reason: `dialMode=${mode} understøtter ikke server-side dispatch`,
    });
  }
  const targetTotal = Math.min(
    Math.floor(readyCount * ratio),
    MAX_IN_FLIGHT_PER_CAMPAIGN,
  );
  let newCallsNeeded = Math.max(0, targetTotal - inFlightCalls);
  if (maxNewCallsOverride !== null) {
    newCallsNeeded = Math.min(newCallsNeeded, maxNewCallsOverride);
  }
  if (newCallsNeeded === 0) {
    return NextResponse.json({
      ok: true,
      dispatched: 0,
      attempted: 0,
      ready: readyCount,
      inFlight: inFlightCalls,
      reason: `Allerede ${inFlightCalls}/${targetTotal} i luften — ingen nye nu.`,
    });
  }

  // 4) Find næste leads — ekskluder dem der allerede er i kø, låst, eller ikke i NEW status
  // Vi bruger IKKE eksisterende lead-lock fordi det knytter til en specifik user, mens
  // vores dispatch er campaign-niveau — i stedet bruger vi DialerQueueItem som "soft lock".
  const queuedLeadIds = (
    await prisma.dialerQueueItem.findMany({
      where: { campaignId },
      select: { leadId: true },
    })
  ).map((q) => q.leadId);

  const candidates = await prisma.lead.findMany({
    where: {
      campaignId,
      status: "NEW",
      lockedByUserId: null,
      id: queuedLeadIds.length > 0 ? { notIn: queuedLeadIds } : undefined,
      // Ikke planlagt callback for andre brugere
      callbackReservedByUserId: null,
    },
    select: { id: true, phone: true, companyName: true },
    orderBy: [{ importedAt: "asc" }],
    take: newCallsNeeded * 2, // hent ekstra i tilfælde af ugyldige numre
  });

  // 5) Reservér leads i DialerQueueItem (atomisk for at undgå race med samtidige dispatches)
  const expiresAt = new Date(Date.now() + QUEUE_RESERVATION_TTL_MS);
  const reserved: { leadId: string; phone: string; e164: string }[] = [];

  for (const lead of candidates) {
    if (reserved.length >= newCallsNeeded) break;
    const e164 = normalizePhoneToE164ForDial(lead.phone);
    if (!e164) continue; // ugyldigt nummer
    try {
      await prisma.dialerQueueItem.create({
        data: {
          campaignId,
          leadId: lead.id,
          expiresAt,
        },
      });
      reserved.push({ leadId: lead.id, phone: lead.phone, e164 });
    } catch {
      // Race: andet dispatch tog samme lead, prøv næste
      continue;
    }
  }

  if (reserved.length === 0) {
    return NextResponse.json({
      ok: true,
      dispatched: 0,
      attempted: 0,
      ready: readyCount,
      inFlight: inFlightCalls,
      reason: "Ingen flere ledige leads at dispatche (alle er allerede i kø, låst eller ugyldige numre).",
    });
  }

  // 6) Place outbound calls parallelt med AMD
  const webhookUrl = process.env.TELNYX_CALL_WEBHOOK_URL?.trim() || undefined;
  const dispatchId = `disp_${Date.now()}_${session!.user.id.slice(-4)}`;

  const dialResults = await Promise.all(
    reserved.map(async (r) => {
      const fromE164 = pickTelnyxFromNumber(r.leadId);
      if (!fromE164) {
        return { leadId: r.leadId, ok: false as const, error: "TELNYX_FROM_NUMBER mangler" };
      }
      const clientState = encodeDialerClientState({
        v: 1,
        kind: "lead",
        campaignId,
        leadId: r.leadId,
        dispatchId,
      });
      const dial = await dialTelnyxOutbound({
        connectionId,
        from: fromE164,
        to: r.e164,
        apiKey,
        clientState,
        webhookUrl,
        amd: amdMode === "off" ? undefined : { ...DEFAULT_AMD, mode: amdMode },
        timeoutSecs: 25,
      });
      if (!dial.ok) {
        return { leadId: r.leadId, ok: false as const, error: dial.message };
      }
      return {
        leadId: r.leadId,
        ok: true as const,
        callControlId: dial.callControlId,
        callSessionId: dial.callSessionId,
        from: fromE164,
        to: r.e164,
      };
    }),
  );

  // 7) Persistér resultater + cleanup fejlede reservationer
  const successes: typeof dialResults = [];
  const failures: { leadId: string; error: string }[] = [];

  for (const r of dialResults) {
    if (r.ok) {
      successes.push(r);
      // Race-beskyttelse: webhook kan have oprettet DialerCallLog før vi når hertil
      // (Telnyx svarer med call_control_id, vi opretter log, men AMD kan fyre i mellemtiden).
      // Brug upsert så vi aldrig fejler på unique-constraint og altid sikrer agent/queue-data.
      await prisma.$transaction([
        prisma.dialerCallLog.upsert({
          where: { callControlId: r.callControlId },
          create: {
            campaignId,
            leadId: r.leadId,
            callControlId: r.callControlId,
            callSessionId: r.callSessionId ?? null,
            direction: "outbound-lead",
            state: "initiated",
            fromNumber: r.from,
            toNumber: r.to,
          },
          update: {
            campaignId,
            leadId: r.leadId,
            callSessionId: r.callSessionId ?? null,
            direction: "outbound-lead",
            fromNumber: r.from,
            toNumber: r.to,
          },
        }),
        prisma.dialerQueueItem.update({
          where: { leadId: r.leadId },
          data: { activeCallControlId: r.callControlId, attempts: { increment: 1 } },
        }),
      ]).catch((err) => {
        console.error("[dispatch] persist call log/queue failed", err);
      });
    } else {
      failures.push({ leadId: r.leadId, error: r.error });
      await prisma.dialerQueueItem.deleteMany({ where: { leadId: r.leadId } });
    }
  }

  return NextResponse.json({
    ok: true,
    dispatched: successes.length,
    attempted: reserved.length,
    failed: failures.length,
    ready: readyCount,
    inFlight: inFlightCalls + successes.length,
    target: targetTotal,
    dispatchId,
    errors: failures.length > 0 ? failures : undefined,
  });
}

/**
 * Cleanup udløbne queue-items (fx hvis webhook'en aldrig modtog en hangup pga server-restart).
 * Kan kaldes manuelt eller fra cron.
 */
export async function DELETE() {
  const { response } = await requireSession();
  if (response) return response;
  const now = new Date();
  const expired = await prisma.dialerQueueItem.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return NextResponse.json({ ok: true, cleaned: expired.count });
}

export const runtime = "nodejs";
