/**
 * Plan for at kopiere optagelser (med transskriptioner og analyser) fra én database til en anden —
 * ved deploy fra Neon-branchen til produktion. Rene funktioner; I/O ligger i
 * scripts/copy-scripts-traening-data.ts.
 */
import { INITIAL_PIPELINE_STATUSES } from "@/lib/call-recording-linking";

/** Status, der følger med til målet (fejl gør ikke — målet prøver selv igen). */
const CARRIED_STATUSES: ReadonlySet<string> = new Set(["TRANSCRIBED", "NO_SPEECH", "ANALYZED"]);

export type CopySourceRecording = {
  id: string;
  telnyxRecordingId: string;
  pipelineStatus: string;
  pipelineError: string | null;
  agentUserId: string | null;
  leadId: string | null;
  campaignId: string | null;
};

export type CopyTargetRecording = {
  id: string;
  telnyxRecordingId: string;
  pipelineStatus: string;
  hasTranscript: boolean;
};

export type RecordingCopyPlan<T extends CopySourceRecording> = {
  /** Nye rækker. Fremmednøgler, der ikke findes i målet, er sat til null. */
  create: T[];
  /** Kildens id → målets id for de optagelser, hvis transskription og analyser skal med. */
  carry: Map<string, string>;
  /** Eksisterende rækker i målet (i en startstatus), der får kildens status: status → Telnyx-id'er. */
  statusUpdates: Map<string, string[]>;
  /** Findes allerede transskriberet i målet — rør dem ikke (analysernes segmentnumre ville ikke passe). */
  skipped: number;
  nulled: { agent: number; lead: number; campaign: number };
};

export function planRecordingCopy<T extends CopySourceRecording>(
  source: T[],
  target: CopyTargetRecording[],
  existing: { userIds: ReadonlySet<string>; leadIds: ReadonlySet<string>; campaignIds: ReadonlySet<string> },
): RecordingCopyPlan<T> {
  const byTelnyxId = new Map(target.map((t) => [t.telnyxRecordingId, t]));
  const plan: RecordingCopyPlan<T> = {
    create: [],
    carry: new Map(),
    statusUpdates: new Map(),
    skipped: 0,
    nulled: { agent: 0, lead: 0, campaign: 0 },
  };

  for (const rec of source) {
    const hit = byTelnyxId.get(rec.telnyxRecordingId);
    if (hit) {
      if (hit.hasTranscript) {
        plan.skipped += 1;
        continue;
      }
      plan.carry.set(rec.id, hit.id);
      if (INITIAL_PIPELINE_STATUSES.has(hit.pipelineStatus) && CARRIED_STATUSES.has(rec.pipelineStatus)) {
        plan.statusUpdates.set(rec.pipelineStatus, [...(plan.statusUpdates.get(rec.pipelineStatus) ?? []), rec.telnyxRecordingId]);
      }
      continue;
    }

    const row = { ...rec };
    if (row.agentUserId && !existing.userIds.has(row.agentUserId)) {
      row.agentUserId = null;
      plan.nulled.agent += 1;
    }
    if (row.leadId && !existing.leadIds.has(row.leadId)) {
      row.leadId = null;
      plan.nulled.lead += 1;
    }
    if (row.campaignId && !existing.campaignIds.has(row.campaignId)) {
      row.campaignId = null;
      plan.nulled.campaign += 1;
    }
    if (!INITIAL_PIPELINE_STATUSES.has(row.pipelineStatus) && !CARRIED_STATUSES.has(row.pipelineStatus)) {
      row.pipelineStatus = "NEW";
      row.pipelineError = null;
    }
    plan.create.push(row);
    plan.carry.set(rec.id, rec.id);
  }
  return plan;
}
