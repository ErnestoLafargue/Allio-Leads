/**
 * Import af Telnyx-optagelser → `CallRecording` — fundamentet for «Scripts & Træning».
 *
 * Henter alle optagelser (`GET /v2/recordings`) og kobler hver til sælger, lead, kampagne og
 * udfald (reglerne ligger i `call-recording-linking.ts`). Idempotent — upsert på Telnyx'
 * recording id — så den også kan køre som løbende afstemning; en pipeline-status sat af
 * senere trin (transskribering/analyse) overskrives aldrig.
 *
 * Lead: eksisterende CALL_RECORDING-aktivitet → client_state → sælgerens CALL_ATTEMPT på
 * kundens nummer lige før optagelsen → samme opslag som webhook/backfill (DialerCallLog →
 * entydigt telefonnummer).
 */
import { prisma } from "@/lib/prisma";
import {
  INITIAL_PIPELINE_STATUSES,
  initialPipelineStatus,
  matchCallAttempt,
  outcomeWindowEnd,
  pickCallOutcome,
  recordingDirection,
  resolveRecordingAgent,
  type AgentMatch,
  type CallAttemptLite,
  type CallDirection,
  type OutcomeLogLite,
} from "@/lib/call-recording-linking";
import { decodeDialerClientState } from "@/lib/dialer-shared";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";
import { buildConnectionName } from "@/lib/telnyx-provision-agents-server";
import { resolveLeadContextForTelnyxRecording } from "@/lib/telnyx-recording-lead-resolve";
import {
  isVercelBlobUrl,
  listTelnyxRecordings,
  type TelnyxRecording,
} from "@/lib/telnyx-recordings-backfill";

const TELNYX_API_BASE = "https://api.telnyx.com/v2";

type LeadMatch = "ACTIVITY" | "CLIENT_STATE" | "CALL_ATTEMPT" | "DIALER_LOG" | "PHONE" | "NONE";

export type CallRecordingImportStats = {
  fetched: number;
  created: number;
  updated: number;
  agentMatch: Record<string, number>;
  leadMatch: Record<string, number>;
  outcome: Record<string, number>;
  pipeline: Record<string, number>;
  errors: { recordingId: string; message: string }[];
};

type LinkedRecording = {
  rec: TelnyxRecording;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  direction: CallDirection;
  customerNumber: string | null;
  leadId: string | null;
  leadMatch: LeadMatch;
  dialerCampaignId: string | null;
  agentUserId: string | null;
  agentMatch: AgentMatch;
  activity: { id: string; recordingUrl: string | null } | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Telnyx' `created_at` mangler tidszone (UTC); `recording_*_at` har `Z`. */
function utcDate(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(/(Z|[+-]\d\d:?\d\d)$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function bump(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Alle sider af en Telnyx-liste (fx `connections`, `phone_numbers`). */
async function fetchAllTelnyxPages(apiKey: string, path: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let page = 1; ; page++) {
    const qs = new URLSearchParams({ "page[number]": String(page), "page[size]": "250" });
    const res = await fetch(`${TELNYX_API_BASE}/${path}?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Telnyx ${path} HTTP ${res.status}`);
    const json = (await res.json()) as { data?: unknown; meta?: { total_pages?: unknown } };
    const data = Array.isArray(json.data) ? (json.data as Record<string, unknown>[]) : [];
    out.push(...data);
    const totalPages = typeof json.meta?.total_pages === "number" ? json.meta.total_pages : page;
    if (data.length === 0 || page >= totalPages) return out;
  }
}

async function fetchAllRecordings(apiKey: string, fromIso: string | null): Promise<TelnyxRecording[]> {
  const byId = new Map<string, TelnyxRecording>();
  for (let page = 1; ; page++) {
    const res = await listTelnyxRecordings({ apiKey, pageNumber: page, pageSize: 250, fromIso });
    if (!res.ok) throw new Error(res.message);
    for (const r of res.recordings) byId.set(r.id, r);
    if (res.recordings.length === 0 || page >= (res.page.totalPages ?? page)) {
      return [...byId.values()];
    }
  }
}

export async function importCallRecordings(params: {
  apiKey: string;
  /** Kun optagelser oprettet fra dette tidspunkt (afstemning). Udeladt = alle. */
  fromIso?: string | null;
  concurrency?: number;
  log?: (line: string) => void;
}): Promise<CallRecordingImportStats> {
  const log = params.log ?? (() => {});
  const concurrency = params.concurrency ?? 8;
  const stats: CallRecordingImportStats = {
    fetched: 0,
    created: 0,
    updated: 0,
    agentMatch: {},
    leadMatch: {},
    outcome: {},
    pipeline: {},
    errors: [],
  };

  const [recordings, connections, phoneNumbers] = await Promise.all([
    fetchAllRecordings(params.apiKey, params.fromIso ?? null),
    fetchAllTelnyxPages(params.apiKey, "connections"),
    fetchAllTelnyxPages(params.apiKey, "phone_numbers"),
  ]);
  stats.fetched = recordings.length;
  log(
    `Telnyx: ${recordings.length} optagelser, ${connections.length} forbindelser, ${phoneNumbers.length} numre`,
  );

  const ourNumbers = new Set(
    phoneNumbers
      .map((n) => normalizePhoneToE164ForDial(str(n.phone_number) ?? ""))
      .filter((n): n is string => n !== null),
  );
  const connectionNameById = new Map<string, string>();
  for (const c of connections) {
    const id = str(c.id);
    const name = str(c.connection_name);
    if (id && name) connectionNameById.set(id, name.toLowerCase());
  }

  const attemptsSince = params.fromIso ? new Date(Date.parse(params.fromIso) - 60 * 60 * 1000) : undefined;
  const [users, activities, dialerLogs, attempts] = await Promise.all([
    prisma.user.findMany({ select: { id: true, telnyxCredentialConnectionId: true } }),
    prisma.leadActivityEvent.findMany({
      where: { kind: LEAD_ACTIVITY_KIND.CALL_RECORDING, telnyxCallLegId: { not: null } },
      select: { id: true, leadId: true, userId: true, telnyxCallLegId: true, recordingUrl: true },
    }),
    prisma.dialerCallLog.findMany({
      where: { callSessionId: { not: null } },
      select: { callSessionId: true, agentUserId: true, campaignId: true, direction: true },
    }),
    prisma.leadActivityEvent.findMany({
      where: { kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT, createdAt: { gte: attemptsSince } },
      select: { leadId: true, userId: true, createdAt: true, lead: { select: { phone: true } } },
    }),
  ]);

  const attemptsByNumber = new Map<string, CallAttemptLite[]>();
  for (const a of attempts) {
    const number = normalizePhoneToE164ForDial(a.lead.phone);
    if (!number) continue;
    const list = attemptsByNumber.get(number) ?? [];
    list.push({ leadId: a.leadId, userId: a.userId, createdAt: a.createdAt });
    attemptsByNumber.set(number, list);
  }

  const userIdByConnectionId = new Map<string, string>();
  for (const u of users) {
    if (u.telnyxCredentialConnectionId) userIdByConnectionId.set(u.telnyxCredentialConnectionId, u.id);
  }
  // Nuværende navneformat (32 tegn) + det ældre `allioagent{userId}` fra de første forbindelser.
  const userIdByConnectionName = new Map<string, string>();
  for (const u of users) {
    userIdByConnectionName.set(buildConnectionName(u.id), u.id);
    userIdByConnectionName.set(`allioagent${u.id}`.toLowerCase(), u.id);
  }
  const activityByLegId = new Map(activities.map((a) => [a.telnyxCallLegId!, a]));

  // Pr. session: foretræk benet med sælger, dernæst lead-benet (outbound-lead).
  const dialerRank = (d: (typeof dialerLogs)[number]) =>
    (d.agentUserId ? 2 : 0) + (d.direction === "outbound-lead" ? 1 : 0);
  const dialerBySession = new Map<string, (typeof dialerLogs)[number]>();
  for (const d of dialerLogs) {
    const prev = dialerBySession.get(d.callSessionId!);
    if (!prev || dialerRank(d) > dialerRank(prev)) dialerBySession.set(d.callSessionId!, d);
  }

  const linkOne = async (rec: TelnyxRecording): Promise<LinkedRecording> => {
    const startedAt = utcDate(rec.raw.recording_started_at) ?? utcDate(rec.raw.created_at);
    if (!startedAt) throw new Error("Optagelsen mangler tidspunkt.");
    const durationSeconds = Math.max(0, Math.round((rec.durationMillis ?? 0) / 1000));
    const endedAt =
      utcDate(rec.raw.recording_ended_at) ?? new Date(startedAt.getTime() + durationSeconds * 1000);

    const activity =
      activityByLegId.get(`rec:${rec.id}`) ??
      (rec.callControlId ? activityByLegId.get(rec.callControlId) : undefined) ??
      null;
    const dialer = rec.callSessionId ? dialerBySession.get(rec.callSessionId) : undefined;
    const clientState = decodeDialerClientState(rec.clientState);
    const { direction, customerNumber } = recordingDirection(rec.fromNumber, rec.toNumber, ourNumbers);

    let dialerAgentUserId = dialer?.agentUserId ?? null;
    let attemptUserId: string | null = null;
    const agentInput = {
      connectionId: str(rec.raw.connection_id),
      userIdByConnectionId,
      connectionNameById,
      userIdByConnectionName,
      activityUserId: activity?.userId ?? null,
    };
    // Sælgeren kendt fra forbindelse/dialer afgrænser, hvilke opkaldsforsøg der tæller.
    const knownAgent = resolveRecordingAgent({ ...agentInput, dialerAgentUserId, attemptUserId: null });

    let leadId: string | null = null;
    let leadMatch: LeadMatch = "NONE";
    const attempt = customerNumber
      ? matchCallAttempt(attemptsByNumber.get(customerNumber) ?? [], {
          startedAt,
          agentUserId: knownAgent.agentUserId,
        })
      : null;
    if (activity) {
      leadId = activity.leadId;
      leadMatch = "ACTIVITY";
    } else if (clientState?.leadId) {
      leadId = clientState.leadId;
      leadMatch = "CLIENT_STATE";
    } else if (attempt) {
      leadId = attempt.leadId;
      leadMatch = "CALL_ATTEMPT";
      attemptUserId = attempt.userId;
    } else {
      const resolved = await resolveLeadContextForTelnyxRecording({
        callControlId: rec.callControlId,
        callSessionId: rec.callSessionId,
        clientStateLeadId: null,
        clientStateUserId: null,
        fromNumber: rec.fromNumber,
        toNumber: rec.toNumber,
      });
      if (resolved.leadId) {
        leadId = resolved.leadId;
        leadMatch = resolved.resolutionSource === "phone" ? "PHONE" : "DIALER_LOG";
        dialerAgentUserId ??= resolved.agentUserId;
      }
    }
    if (attempt && attempt.leadId === leadId) attemptUserId ??= attempt.userId;

    const { agentUserId, agentMatch } = resolveRecordingAgent({
      ...agentInput,
      dialerAgentUserId,
      attemptUserId,
    });

    return {
      rec,
      startedAt,
      endedAt,
      durationSeconds,
      direction,
      customerNumber,
      leadId,
      leadMatch,
      dialerCampaignId: dialer?.campaignId ?? null,
      agentUserId,
      agentMatch,
      activity: activity ? { id: activity.id, recordingUrl: activity.recordingUrl } : null,
    };
  };

  const linked = (
    await mapWithConcurrency(recordings, concurrency, async (rec) => {
      try {
        return await linkOne(rec);
      } catch (err) {
        stats.errors.push({
          recordingId: rec.id,
          message: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    })
  ).filter((l): l is LinkedRecording => l !== null);
  log(`Koblet ${linked.length} optagelser`);

  // Leads kan være slettet siden (fx client_state) — kun eksisterende leads kobles på.
  const leadIds = [...new Set(linked.map((l) => l.leadId).filter((id): id is string => id !== null))];
  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, campaignId: true },
  });
  const campaignIdByLead = new Map(leads.map((l) => [l.id, l.campaignId]));
  for (const l of linked) {
    if (l.leadId && !campaignIdByLead.has(l.leadId)) {
      l.leadId = null;
      l.leadMatch = "NONE";
    }
  }

  const earliest = linked.reduce(
    (min, l) => (l.startedAt.getTime() < min ? l.startedAt.getTime() : min),
    Date.now(),
  );
  const outcomeLogs = leadIds.length
    ? await prisma.leadOutcomeLog.findMany({
        where: { leadId: { in: leadIds }, userId: { not: null }, createdAt: { gte: new Date(earliest) } },
        select: { leadId: true, status: true, userId: true, createdAt: true },
      })
    : [];
  const outcomeLogsByLead = new Map<string, OutcomeLogLite[]>();
  for (const o of outcomeLogs) {
    const list = outcomeLogsByLead.get(o.leadId) ?? [];
    list.push(o);
    outcomeLogsByLead.set(o.leadId, list);
  }

  // Udfaldsvinduet stopper, når næste optagede opkald på samme lead starter.
  const byLead = new Map<string, LinkedRecording[]>();
  for (const l of linked) {
    if (!l.leadId) continue;
    const list = byLead.get(l.leadId) ?? [];
    list.push(l);
    byLead.set(l.leadId, list);
  }
  const outcomeByRecording = new Map<string, OutcomeLogLite>();
  for (const [leadId, calls] of byLead) {
    calls.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    const logs = outcomeLogsByLead.get(leadId) ?? [];
    calls.forEach((call, i) => {
      const next = calls[i + 1]?.startedAt ?? null;
      const outcome = pickCallOutcome(
        logs,
        { start: call.startedAt, end: outcomeWindowEnd(call.endedAt, next) },
        call.agentUserId,
      );
      if (outcome) outcomeByRecording.set(call.rec.id, outcome);
    });
  }

  const existingStatus = new Map(
    (
      await prisma.callRecording.findMany({
        where: { telnyxRecordingId: { in: linked.map((l) => l.rec.id) } },
        select: { telnyxRecordingId: true, pipelineStatus: true },
      })
    ).map((r) => [r.telnyxRecordingId, r.pipelineStatus]),
  );

  // Power dialerens egne record_start-optagelser er dubletter, når Telnyx-profilen ("Trunking")
  // også har optaget samme opkald komplet — de mangler desuden ofte den ene kanal.
  const trunkSessions = new Set(
    linked
      .filter((l) => str(l.rec.raw.initiated_by) === "Trunking" && l.rec.callSessionId)
      .map((l) => l.rec.callSessionId!),
  );
  const isDuplicate = (l: LinkedRecording) =>
    str(l.rec.raw.initiated_by) === "StartCallRecordingAPI" &&
    l.rec.callSessionId !== null &&
    trunkSessions.has(l.rec.callSessionId);

  await mapWithConcurrency(linked, concurrency, async (l) => {
    const outcome = outcomeByRecording.get(l.rec.id) ?? null;
    const pipelineStatus = initialPipelineStatus(l.durationSeconds, outcome?.status ?? null, isDuplicate(l));
    const data = {
      telnyxCallSessionId: l.rec.callSessionId,
      telnyxCallLegId: l.rec.callLegId,
      telnyxCallControlId: l.rec.callControlId,
      telnyxConnectionId: str(l.rec.raw.connection_id),
      initiatedBy: str(l.rec.raw.initiated_by),
      channels: str(l.rec.raw.channels) ?? "single",
      direction: l.direction,
      fromNumber: l.rec.fromNumber,
      toNumber: l.rec.toNumber,
      customerNumber: l.customerNumber,
      startedAt: l.startedAt,
      endedAt: l.endedAt,
      durationSeconds: l.durationSeconds,
      agentUserId: l.agentUserId,
      agentMatch: l.agentMatch,
      leadId: l.leadId,
      leadMatch: l.leadMatch,
      campaignId: l.dialerCampaignId ?? (l.leadId ? campaignIdByLead.get(l.leadId) ?? null : null),
      activityEventId: l.activity?.id ?? null,
      playbackUrl:
        l.activity?.recordingUrl && isVercelBlobUrl(l.activity.recordingUrl)
          ? l.activity.recordingUrl
          : null,
      outcomeStatus: outcome?.status ?? null,
      outcomeAt: outcome?.createdAt ?? null,
    };
    const previous = existingStatus.get(l.rec.id);
    const keepStatus = previous !== undefined && !INITIAL_PIPELINE_STATUSES.has(previous);
    try {
      await prisma.callRecording.upsert({
        where: { telnyxRecordingId: l.rec.id },
        create: { telnyxRecordingId: l.rec.id, ...data, pipelineStatus },
        update: keepStatus ? data : { ...data, pipelineStatus },
      });
    } catch (err) {
      stats.errors.push({
        recordingId: l.rec.id,
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    if (previous === undefined) stats.created += 1;
    else stats.updated += 1;
    bump(stats.agentMatch, l.agentMatch);
    bump(stats.leadMatch, l.leadMatch);
    bump(stats.outcome, outcome?.status ?? "NONE");
    bump(stats.pipeline, keepStatus ? previous : pipelineStatus);
  });

  log(`Gemt: ${stats.created} nye, ${stats.updated} opdateret, ${stats.errors.length} fejl`);
  return stats;
}
