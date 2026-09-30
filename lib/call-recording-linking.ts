/**
 * Ren (DB-fri) logik til at koble Telnyx-optagelser til retning, sælger, udfald og
 * pipeline-status. Bruges af importen i `call-recording-import.ts`.
 */
import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";

/** Kortere optagelser er næsten altid voicemail eller ingen svar — de analyseres ikke. */
export const MIN_ANALYZE_SECONDS = 15;

/** Udfald sat mere end dette efter opkaldets slut tilskrives ikke opkaldet. */
export const OUTCOME_WINDOW_MS = 30 * 60 * 1000;

export const CALL_RECORDING_PIPELINE = {
  NEW: "NEW",
  SKIPPED_SHORT: "SKIPPED_SHORT",
  SKIPPED_NO_CONVERSATION: "SKIPPED_NO_CONVERSATION",
  /** App-optagelse (record_start) af et opkald, som Telnyx-profilen også har optaget komplet. */
  SKIPPED_DUPLICATE: "SKIPPED_DUPLICATE",
} as const;

/** Statusser importen selv sætter — senere trin (transskribering/analyse) overskrives aldrig. */
export const INITIAL_PIPELINE_STATUSES: ReadonlySet<string> = new Set(
  Object.values(CALL_RECORDING_PIPELINE),
);

/** Udfald der betyder, at der ikke var nogen samtale at analysere. */
const NO_CONVERSATION_OUTCOMES: ReadonlySet<string> = new Set(["VOICEMAIL", "NOT_HOME"]);

export type CallDirection = "outbound" | "inbound" | "unknown";

/** Retning ud fra vores egne Telnyx-numre (E.164); kundens nummer er den anden part. */
export function recordingDirection(
  fromNumber: string | null,
  toNumber: string | null,
  ourNumbers: ReadonlySet<string>,
): { direction: CallDirection; customerNumber: string | null } {
  const from = normalizePhoneToE164ForDial(fromNumber ?? "");
  const to = normalizePhoneToE164ForDial(toNumber ?? "");
  if (from && ourNumbers.has(from)) return { direction: "outbound", customerNumber: to };
  if (to && ourNumbers.has(to)) return { direction: "inbound", customerNumber: from };
  return { direction: "unknown", customerNumber: null };
}

export type AgentMatch =
  | "CONNECTION"
  | "CONNECTION_NAME"
  | "DIALER_LOG"
  | "ACTIVITY"
  | "CALL_ATTEMPT"
  | "NONE";

/**
 * Sælgeren bag en optagelse. Manuelle opkald går via sælgerens egen credential connection
 * (`User.telnyxCredentialConnectionId`, ellers navnet `allioagent<endelse af User.id>` når
 * forbindelsen er gammel); power dialer-opkald går via Call Control-appen, så dér bruges
 * `DialerCallLog`. Aktivitetens og opkaldsforsøgets userId er sidste udvej.
 */
export function resolveRecordingAgent(input: {
  connectionId: string | null;
  userIdByConnectionId: ReadonlyMap<string, string>;
  connectionNameById: ReadonlyMap<string, string>;
  userIdByConnectionName: ReadonlyMap<string, string>;
  dialerAgentUserId: string | null;
  activityUserId: string | null;
  attemptUserId: string | null;
}): { agentUserId: string | null; agentMatch: AgentMatch } {
  if (input.connectionId) {
    const direct = input.userIdByConnectionId.get(input.connectionId);
    if (direct) return { agentUserId: direct, agentMatch: "CONNECTION" };
    const name = input.connectionNameById.get(input.connectionId);
    const byName = name ? input.userIdByConnectionName.get(name) : undefined;
    if (byName) return { agentUserId: byName, agentMatch: "CONNECTION_NAME" };
  }
  if (input.dialerAgentUserId) {
    return { agentUserId: input.dialerAgentUserId, agentMatch: "DIALER_LOG" };
  }
  if (input.activityUserId) return { agentUserId: input.activityUserId, agentMatch: "ACTIVITY" };
  if (input.attemptUserId) return { agentUserId: input.attemptUserId, agentMatch: "CALL_ATTEMPT" };
  return { agentUserId: null, agentMatch: "NONE" };
}

export type CallAttemptLite = { leadId: string; userId: string | null; createdAt: Date };

/** CALL_ATTEMPT logges når sælgeren trykker ring — optagelsen starter først når kunden svarer. */
export const CALL_ATTEMPT_WINDOW = { beforeMs: 3 * 60 * 1000, afterMs: 30 * 1000 };

/**
 * Leadet sælgeren ringede op fra dialeren lige før optagelsen startede (forsøg på kundens
 * nummer). Skelner mellem dubletter med samme telefonnummer; kun et entydigt lead bruges.
 */
export function matchCallAttempt(
  attemptsForNumber: readonly CallAttemptLite[],
  call: { startedAt: Date; agentUserId: string | null },
): { leadId: string; userId: string | null } | null {
  const from = call.startedAt.getTime() - CALL_ATTEMPT_WINDOW.beforeMs;
  const to = call.startedAt.getTime() + CALL_ATTEMPT_WINDOW.afterMs;
  const hits = attemptsForNumber.filter((a) => {
    const t = a.createdAt.getTime();
    return t >= from && t <= to && (!call.agentUserId || a.userId === call.agentUserId);
  });
  if (new Set(hits.map((h) => h.leadId)).size !== 1) return null;
  const onlyUser = new Set(hits.map((h) => h.userId)).size === 1;
  return { leadId: hits[0]!.leadId, userId: onlyUser ? hits[0]!.userId : null };
}

export type OutcomeLogLite = { status: string; userId: string | null; createdAt: Date };

/** Udfaldsvinduet slutter 30 min efter opkaldet — eller når næste optagede opkald på leadet starter. */
export function outcomeWindowEnd(endedAt: Date, nextCallStartedAt: Date | null): Date {
  const cap = endedAt.getTime() + OUTCOME_WINDOW_MS;
  return new Date(nextCallStartedAt ? Math.min(cap, nextCallStartedAt.getTime()) : cap);
}

/**
 * Udfaldet for ét opkald: det seneste udfald en sælger satte på leadet i [start, slut) — så en
 * rettelse lige efter opkaldet vinder. Opkaldets egen sælger foretrækkes; systemets
 * auto-udfald (userId = null) tæller ikke.
 */
export function pickCallOutcome(
  logs: readonly OutcomeLogLite[],
  window: { start: Date; end: Date },
  agentUserId: string | null,
): OutcomeLogLite | null {
  const start = window.start.getTime();
  const end = window.end.getTime();
  const inWindow = logs.filter((l) => {
    const t = l.createdAt.getTime();
    return l.userId !== null && t >= start && t < end;
  });
  const own = agentUserId ? inWindow.filter((l) => l.userId === agentUserId) : [];
  const pool = own.length > 0 ? own : inWindow;
  let latest: OutcomeLogLite | null = null;
  for (const l of pool) {
    if (!latest || l.createdAt.getTime() > latest.createdAt.getTime()) latest = l;
  }
  return latest;
}

export function initialPipelineStatus(
  durationSeconds: number,
  outcomeStatus: string | null,
  isDuplicate = false,
): string {
  if (isDuplicate) return CALL_RECORDING_PIPELINE.SKIPPED_DUPLICATE;
  if (durationSeconds < MIN_ANALYZE_SECONDS) return CALL_RECORDING_PIPELINE.SKIPPED_SHORT;
  if (outcomeStatus && NO_CONVERSATION_OUTCOMES.has(outcomeStatus)) {
    return CALL_RECORDING_PIPELINE.SKIPPED_NO_CONVERSATION;
  }
  return CALL_RECORDING_PIPELINE.NEW;
}
