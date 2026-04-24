import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  appendRawEvent,
  decodeDialerClientState,
  isDuplicateEvent,
  pickCallControlId,
  type TelnyxWebhookEnvelope,
} from "@/lib/dialer-shared";
import { handleAmdHuman, handleAmdMachine } from "@/lib/dialer-bridge";
import { LEAD_ACTIVITY_KIND, maskPhoneForActivity } from "@/lib/lead-activity-kinds";
import { startTelnyxRecording } from "@/lib/telnyx-call-control";

/**
 * Telnyx Call Control webhook — modtager alle events relateret til opkald
 * vores server placerer (lead-legs + agent-legs).
 *
 * Telnyx-portalkonfig:
 *   Voice → Call Control Application (TELNYX_CONNECTION_ID) → Webhook URL =
 *   https://allio-leads.example.com/api/telnyx/webhooks/call-events
 *   Failover URL = (valgfrit) /api/telnyx/voice/events/failover
 *   API version = "API v2"
 *
 * Idempotens: Telnyx kan retrye events op til 5 gange. Vi gemmer event-id i
 * DialerCallLog.rawEventsJson og dropper duplikater. updateMany er idempotent.
 *
 * Vi svarer 200 så hurtigt som muligt og laver "fire-and-forget" bridge for at undgå
 * at Telnyx-webhooken timer ud (max 10 sek).
 */

function safeJsonParse(raw: string): TelnyxWebhookEnvelope | null {
  try {
    return JSON.parse(raw) as TelnyxWebhookEnvelope;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const raw = await req.text();
  const body = safeJsonParse(raw);
  if (!body || !body.data) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const eventType = String(body.data.event_type ?? "");
  const eventId = body.data.id;
  const occurredAt = body.data.occurred_at ?? new Date().toISOString();
  const payload = body.data.payload ?? {};

  const callControlId = pickCallControlId(payload);
  if (!callControlId) {
    // Telnyx events uden call_control_id (fx system pings) — bare 200 OK
    return NextResponse.json({ ok: true });
  }

  const clientState = decodeDialerClientState(payload.client_state);

  // Find eksisterende DialerCallLog (oprettes af dispatcher før udgående eller her ved inbound)
  const existing = await prisma.dialerCallLog.findUnique({
    where: { callControlId },
    select: {
      id: true,
      campaignId: true,
      leadId: true,
      direction: true,
      rawEventsJson: true,
    },
  });

  if (existing && isDuplicateEvent(existing.rawEventsJson, eventId)) {
    return NextResponse.json({ ok: true, skipped: "duplicate" });
  }

  const rawEventsJson = appendRawEvent(existing?.rawEventsJson, {
    type: eventType,
    id: eventId,
    at: occurredAt,
    payload,
  });

  // Sørg for at en log eksisterer — vi tager direction fra client_state hvis det er nyt
  if (!existing && clientState) {
    await prisma.dialerCallLog.create({
      data: {
        campaignId: clientState.campaignId,
        leadId: clientState.leadId ?? null,
        agentUserId: clientState.userId ?? null,
        callControlId,
        callSessionId: payload.call_session_id ?? null,
        direction: clientState.kind === "agent" ? "outbound-agent" : "outbound-lead",
        state: "initiated",
        bridgeTargetId: clientState.linkedCallControlId ?? null,
        fromNumber: payload.from ?? null,
        toNumber: payload.to ?? null,
        rawEventsJson,
      },
    });
  } else if (existing) {
    await prisma.dialerCallLog.update({
      where: { id: existing.id },
      data: { rawEventsJson },
    });
  }

  // State-transition håndtering
  switch (eventType) {
    case "call.initiated": {
      await prisma.dialerCallLog.updateMany({
        where: { callControlId },
        data: { state: "initiated", callSessionId: payload.call_session_id ?? undefined },
      });
      break;
    }
    case "call.answered": {
      await prisma.dialerCallLog.updateMany({
        where: { callControlId },
        data: { state: "answered", answeredAt: new Date() },
      });
      // Agent har svaret deres incoming SIP-leg → marker session som "talking"
      if (clientState?.kind === "agent" && clientState.userId && clientState.campaignId) {
        await prisma.agentSession.updateMany({
          where: {
            userId: clientState.userId,
            campaignId: clientState.campaignId,
          },
          data: { status: "talking" },
        });
      }
      // Click-to-call (kind=manual): ingen AMD, men agenten har eksplicit valgt at ringe
      // → start optagelse straks når lead besvarer. Dispatcher-flow optager separat
      // i handleAmdHuman efter AMD har bekræftet menneske.
      if (clientState?.kind === "manual" && clientState.leadId) {
        const apiKey = process.env.TELNYX_API_KEY?.trim();
        if (apiKey) {
          queueMicrotask(() => {
            startTelnyxRecording({
              apiKey,
              callControlId,
              format: "mp3",
              channels: "dual",
            }).then((rec) => {
              if (!rec.ok) {
                console.error("[telnyx:webhook] manual record_start fejlede:", rec.message);
              }
            }).catch((err) => {
              console.error("[telnyx:webhook] manual record_start exception:", err);
            });
          });
        }
      }
      break;
    }
    case "call.bridged": {
      await prisma.dialerCallLog.updateMany({
        where: { callControlId },
        data: { state: "bridged", bridgedAt: new Date() },
      });
      break;
    }
    case "call.machine.detection.ended":
    case "call.machine.premium.detection.ended":
    case "call.machine.greeting.ended":
    case "call.machine.premium.greeting.ended": {
      // Telnyx returnerer forskellige result-værdier afhængigt af AMD-mode:
      //   detect:           human | machine | not_sure
      //   premium:          human_residence | human_business | machine | silence | fax_detected | not_sure
      //   greeting/beep:    ended | beep_detected | no_beep_detected | not_sure
      //
      // Vi mapper alle varianter til vores 4 interne kategorier:
      //   "human"   → bridge til agent
      //   "machine" → hangup + marker som VOICEMAIL
      //   "fax"     → hangup + marker som VOICEMAIL (faxmaskine = ikke et menneske)
      //   "unknown" → fallback: bridge til agent (bedre at lade agenten beslutte end at miste lead)
      const result = String(payload.result ?? "").toLowerCase();
      let amdResult: "human" | "machine" | "fax" | "unknown";
      switch (result) {
        case "human":
        case "human_residence":
        case "human_business":
          amdResult = "human";
          break;
        case "machine":
          amdResult = "machine";
          break;
        case "fax":
        case "fax_detected":
          amdResult = "fax";
          break;
        case "beep_detected":
        case "no_beep_detected":
        case "ended":
          // Greeting-events fyrer KUN når AMD allerede har konkluderet machine.
          // Vi behandler dem som "machine" så vi ikke bridger til en VM.
          amdResult = "machine";
          break;
        default:
          // silence | not_sure | uventet — usikker resultat → bridge alligevel
          // (false negatives koster en agent 1-2 sek; false positives mister leads).
          amdResult = "unknown";
          break;
      }

      await prisma.dialerCallLog.updateMany({
        where: { callControlId },
        data: {
          amdResult,
          state:
            amdResult === "human"
              ? "human"
              : amdResult === "machine" || amdResult === "fax"
                ? "machine"
                : "answered",
        },
      });

      // Reagér kun på lead-legs (ikke agent-originate-legs).
      // Vi bruger detection.ended (begge varianter) som primær trigger; greeting.ended
      // kommer kun som ekstra info når premium AMD allerede har konkluderet machine.
      const isDetectionEnd =
        eventType === "call.machine.detection.ended" ||
        eventType === "call.machine.premium.detection.ended";
      const isGreetingEndForMachine =
        (eventType === "call.machine.greeting.ended" ||
          eventType === "call.machine.premium.greeting.ended") &&
        amdResult === "machine";

      if (
        clientState?.kind === "lead" &&
        clientState.campaignId &&
        clientState.leadId &&
        (isDetectionEnd || isGreetingEndForMachine)
      ) {
        const apiKey = process.env.TELNYX_API_KEY?.trim();
        if (apiKey) {
          if (amdResult === "human" || amdResult === "unknown") {
            // Bridge til ledig agent — fire-and-forget for ikke at blokere webhook'en.
            queueMicrotask(() => {
              handleAmdHuman({
                apiKey,
                campaignId: clientState.campaignId,
                leadId: clientState.leadId!,
                leadCallControlId: callControlId,
                webhookUrl: process.env.TELNYX_CALL_WEBHOOK_URL?.trim() || undefined,
              }).catch((err) => {
                console.error("[telnyx:webhook] handleAmdHuman fejlede:", err);
              });
            });
          } else if (amdResult === "machine" || amdResult === "fax") {
            // Voicemail/fax → hangup leadet og marker som VOICEMAIL i databasen,
            // så det IKKE kan blive sendt til en agent senere.
            queueMicrotask(() => {
              handleAmdMachine({
                apiKey,
                campaignId: clientState.campaignId,
                leadId: clientState.leadId!,
                leadCallControlId: callControlId,
              }).catch((err) => {
                console.error("[telnyx:webhook] handleAmdMachine fejlede:", err);
              });
            });
          }
        }
      }
      break;
    }
    case "call.hangup": {
      const cause = String(payload.hangup_cause ?? "");
      const source = String(payload.hangup_source ?? "");
      await prisma.dialerCallLog.updateMany({
        where: { callControlId },
        data: {
          state: "hangup",
          endedAt: new Date(),
          hangupCause: cause || null,
          hangupSource: source || null,
        },
      });

      // Find log igen for at hente leadId (kan være sat efter create) + agentUserId
      const log = await prisma.dialerCallLog.findUnique({
        where: { callControlId },
        select: {
          campaignId: true,
          leadId: true,
          agentUserId: true,
          direction: true,
          bridgeTargetId: true,
        },
      });

      if (log) {
        // Frigør queue-item på lead (uanset hvilken leg der lagde på)
        if (log.leadId) {
          await prisma.dialerQueueItem.deleteMany({
            where: { leadId: log.leadId, campaignId: log.campaignId },
          });
        }
        // Frigør agent-session hvis denne leg var bridged til en agent.
        // Vi matcher på begge id'er så det virker uanset om det var lead- eller agent-legen der døde.
        if (log.agentUserId && log.campaignId) {
          await prisma.agentSession.updateMany({
            where: {
              userId: log.agentUserId,
              campaignId: log.campaignId,
              OR: [
                { currentLeadCallControlId: callControlId },
                { currentAgentCallControlId: callControlId },
              ],
            },
            data: {
              status: "wrap_up",
              currentLeadCallControlId: null,
              currentAgentCallControlId: null,
              currentLeadId: null,
            },
          });
        }
        // Hvis lead-leg dør UDEN at AMD nogensinde ringede (no_answer, busy, etc.),
        // frigør evt. ringende agent-session der venter på dette lead.
        if (log.direction === "outbound-lead") {
          await prisma.agentSession.updateMany({
            where: {
              campaignId: log.campaignId,
              status: "ringing",
              currentLeadCallControlId: callControlId,
            },
            data: {
              status: "ready",
              currentLeadCallControlId: null,
              currentAgentCallControlId: null,
              currentLeadId: null,
            },
          });
        }
      }
      break;
    }
    case "call.recording.saved": {
      const url =
        (typeof payload.recording_urls?.mp3 === "string" && payload.recording_urls.mp3) ||
        (typeof payload.recording_urls?.wav === "string" && payload.recording_urls.wav) ||
        null;
      const durationMillisRaw = (payload as Record<string, unknown>).duration_millis;
      const durationSeconds =
        typeof durationMillisRaw === "number"
          ? Math.max(0, Math.round(durationMillisRaw / 1000))
          : null;

      if (!url) break;

      // 1) Persistér på DialerCallLog
      await prisma.dialerCallLog.updateMany({
        where: { callControlId },
        data: { recordingUrl: url },
      });

      // 2) Find leadId + agent fra DialerCallLog (hvis det er et dispatcher-lead-leg)
      //    eller fra clientState (hvis det er et manual click-to-call lead-leg).
      const log = await prisma.dialerCallLog.findUnique({
        where: { callControlId },
        select: {
          leadId: true,
          agentUserId: true,
          direction: true,
          toNumber: true,
        },
      });

      const leadId = log?.leadId ?? clientState?.leadId ?? null;
      const agentUserId = log?.agentUserId ?? clientState?.userId ?? null;

      if (!leadId) break;

      // 3) Skriv en CALL_RECORDING-aktivitet så optagelsen bliver afspilbar i UI'et.
      //    Sæt agent-navnet hvis vi kender det.
      let agentName: string | null = null;
      if (agentUserId) {
        const u = await prisma.user.findUnique({
          where: { id: agentUserId },
          select: { name: true },
        });
        agentName = u?.name ?? null;
      }

      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { phone: true },
      });
      const masked = lead?.phone ? maskPhoneForActivity(lead.phone) : "";
      const durationLabel =
        durationSeconds !== null
          ? `${Math.floor(durationSeconds / 60)}:${(durationSeconds % 60).toString().padStart(2, "0")}`
          : null;
      const summaryParts: string[] = [];
      if (agentName) summaryParts.push(`${agentName} talte med leadet`);
      else summaryParts.push("Samtale optaget");
      if (masked) summaryParts.push(`(${masked})`);
      if (durationLabel) summaryParts.push(`— varighed ${durationLabel}`);
      const summary = summaryParts.join(" ");

      // Idempotens: hvis vi allerede har en aktivitet for samme telnyxCallLegId, opdater den
      // i stedet for at oprette en ny — fx hvis Telnyx retry'er recording.saved.
      const existingActivity = await prisma.leadActivityEvent.findFirst({
        where: { leadId, telnyxCallLegId: callControlId },
        select: { id: true },
      });
      if (existingActivity) {
        await prisma.leadActivityEvent.update({
          where: { id: existingActivity.id },
          data: {
            summary,
            recordingUrl: url,
            durationSeconds,
            userId: agentUserId,
          },
        });
      } else {
        await prisma.leadActivityEvent.create({
          data: {
            leadId,
            userId: agentUserId,
            kind: LEAD_ACTIVITY_KIND.CALL_RECORDING,
            summary,
            recordingUrl: url,
            durationSeconds,
            telnyxCallLegId: callControlId,
          },
        });
      }
      break;
    }
    default: {
      // Ukendte/ikke-relevante events bare logges — staten ændres ikke
      break;
    }
  }

  return NextResponse.json({ ok: true, eventType });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "telnyx-call-events-webhook" });
}

// Tving Node-runtime så vi kan bruge prisma + Buffer
export const runtime = "nodejs";
