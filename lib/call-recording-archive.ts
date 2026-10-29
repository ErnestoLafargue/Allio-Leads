/**
 * Lydarkiv: backup af ALLE Telnyx-optagelser på mindst 20 sekunder i Allios eget lager
 * (Vercel Blob), registreret i `CallRecording.playbackUrl` — også når optagelsen ikke kan
 * kobles til et lead.
 *
 * Telnyx er ikke et sikkert lager: alle optagelser fra før 2026-10-16 forsvandt hos Telnyx,
 * og sælgernes WebRTC-forbindelser sender ingen webhooks. Arkivet kører derfor fra cron hvert
 * 10. minut, ældste først, så intet når at forsvinde. Filerne gemmes mindst 24 måneder;
 * intet i koden sletter dem.
 */
import { prisma } from "@/lib/prisma";
import { fetchAllTelnyxPages } from "@/lib/call-recording-import";
import {
  initialPipelineStatus,
  recordingDirection,
  resolveRecordingAgent,
} from "@/lib/call-recording-linking";
import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";
import { buildConnectionName } from "@/lib/telnyx-provision-agents-server";
import { resolveLeadContextForTelnyxRecording } from "@/lib/telnyx-recording-lead-resolve";
import { downloadTelnyxRecording } from "@/lib/telnyx-recording-storage";
import {
  isVercelBlobUrl,
  listTelnyxRecordings,
  type TelnyxRecording,
} from "@/lib/telnyx-recordings-backfill";

/** Kortere optagelser er næsten altid voicemail/ingen svar — de arkiveres ikke. */
export const ARCHIVE_MIN_SECONDS = 20;
/** Mindste opbevaringstid. Arkivet sletter aldrig selv noget. */
export const ARCHIVE_RETENTION_MONTHS = 24;
/** Hvor langt tilbage i Telnyx arkivet kigger ved hver kørsel. */
export const ARCHIVE_LOOKBACK_DAYS = 30;
const ARCHIVE_CONCURRENCY = 4;

export type ArchiveStats = {
  scanned: number;
  tooShort: number;
  alreadyArchived: number;
  /** Fandtes allerede som Blob-kopi på et lead — kun registreret, ikke kopieret igen. */
  reusedLeadCopy: number;
  copied: number;
  /** Ikke nået i denne kørsel (tidsbudget) — tages ved næste kørsel. */
  remaining: number;
  errors: { recordingId: string; message: string }[];
};

export function recordingDurationSeconds(rec: Pick<TelnyxRecording, "durationMillis">): number {
  return Math.max(0, Math.round((rec.durationMillis ?? 0) / 1000));
}

export function shouldArchiveRecording(rec: Pick<TelnyxRecording, "durationMillis">): boolean {
  return recordingDurationSeconds(rec) >= ARCHIVE_MIN_SECONDS;
}

/** Ældste først, så optagelser tættest på at forsvinde hos Telnyx gemmes før nye. */
export function sortOldestFirst<T extends Pick<TelnyxRecording, "startedAt">>(recs: readonly T[]): T[] {
  return [...recs].sort(
    (a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0),
  );
}

/** Fast sti pr. optagelse — samme optagelse kan aldrig ligge to gange i arkivet. */
export function archiveBlobPath(rec: Pick<TelnyxRecording, "id" | "startedAt">): string {
  const month = (rec.startedAt ?? new Date()).toISOString().slice(0, 7);
  const safeId = rec.id.replace(/[^a-zA-Z0-9_-]/g, "");
  return `call-recordings/archive/${month}/${safeId}.mp3`;
}

async function putArchiveFile(pathname: string, bytes: Buffer): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN mangler.");
  const { put } = await import("@vercel/blob");
  const blob = await put(pathname, bytes, {
    access: "public",
    contentType: "audio/mpeg",
    addRandomSuffix: false,
    token,
  });
  return blob.url;
}

function legIds(rec: TelnyxRecording): string[] {
  return [`rec:${rec.id}`, ...(rec.callControlId ? [rec.callControlId] : [])];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Alle optagelser i vinduet: filtreret liste + de nyeste sider uden filter (filteret kan udelade nye). */
async function listRecordingsSince(apiKey: string, sinceIso: string): Promise<TelnyxRecording[]> {
  const byId = new Map<string, TelnyxRecording>();
  for (const fromIso of [sinceIso, null]) {
    for (let page = 1; page <= (fromIso ? 200 : 2); page++) {
      const res = await listTelnyxRecordings({ apiKey, pageNumber: page, pageSize: 250, fromIso });
      if (!res.ok) throw new Error(res.message);
      for (const r of res.recordings) byId.set(r.id, r);
      if (res.recordings.length < 250) break;
    }
  }
  const since = Date.parse(sinceIso);
  return [...byId.values()].filter((r) => (r.startedAt?.getTime() ?? Date.now()) >= since);
}

/**
 * Arkivér manglende optagelser ≥ 20 s inden for `lookbackDays`, ældste først, til tidsbudgettet
 * (`deadlineAt`) er brugt. Idempotent: kan køres så ofte som nødvendigt.
 */
export async function archiveTelnyxRecordings(params: {
  apiKey: string;
  lookbackDays?: number;
  deadlineAt?: number;
  log?: (line: string) => void;
}): Promise<ArchiveStats> {
  const log = params.log ?? (() => {});
  const stats: ArchiveStats = {
    scanned: 0,
    tooShort: 0,
    alreadyArchived: 0,
    reusedLeadCopy: 0,
    copied: 0,
    remaining: 0,
    errors: [],
  };
  const sinceIso = new Date(
    Date.now() - (params.lookbackDays ?? ARCHIVE_LOOKBACK_DAYS) * 86400000,
  ).toISOString();

  const all = await listRecordingsSince(params.apiKey, sinceIso);
  stats.scanned = all.length;
  const candidates = all.filter(shouldArchiveRecording);
  stats.tooShort = all.length - candidates.length;

  const archived = new Set(
    (
      await prisma.callRecording.findMany({
        where: {
          telnyxRecordingId: { in: candidates.map((r) => r.id) },
          playbackUrl: { contains: ".blob.vercel-storage.com/" },
        },
        select: { telnyxRecordingId: true },
      })
    ).map((r) => r.telnyxRecordingId),
  );
  const todo = sortOldestFirst(candidates.filter((r) => !archived.has(r.id)));
  stats.alreadyArchived = candidates.length - todo.length;
  if (todo.length === 0) return stats;

  // Eksisterende Blob-kopier på leads (fra backfill/webhook) genbruges — ingen dobbelt lagring.
  const leadCopies = new Map<string, { id: string; leadId: string; url: string }>();
  for (const ev of await prisma.leadActivityEvent.findMany({
    where: {
      telnyxCallLegId: { in: todo.flatMap(legIds) },
      recordingUrl: { contains: ".blob.vercel-storage.com/" },
    },
    select: { id: true, leadId: true, telnyxCallLegId: true, recordingUrl: true },
  })) {
    leadCopies.set(ev.telnyxCallLegId!, { id: ev.id, leadId: ev.leadId, url: ev.recordingUrl! });
  }

  const [connections, phoneNumbers, users] = await Promise.all([
    fetchAllTelnyxPages(params.apiKey, "connections"),
    fetchAllTelnyxPages(params.apiKey, "phone_numbers"),
    prisma.user.findMany({ select: { id: true, telnyxCredentialConnectionId: true } }),
  ]);
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
  const userIdByConnectionId = new Map<string, string>();
  const userIdByConnectionName = new Map<string, string>();
  for (const u of users) {
    if (u.telnyxCredentialConnectionId) userIdByConnectionId.set(u.telnyxCredentialConnectionId, u.id);
    userIdByConnectionName.set(buildConnectionName(u.id), u.id);
    userIdByConnectionName.set(`allioagent${u.id}`.toLowerCase(), u.id);
  }

  const archiveOne = async (rec: TelnyxRecording) => {
    try {
      const leadCopy = legIds(rec).map((id) => leadCopies.get(id)).find(Boolean) ?? null;
      let url = leadCopy?.url ?? null;
      if (!url) {
        const source = rec.mp3Url ?? rec.wavUrl;
        if (!source) throw new Error("Ingen download-URL fra Telnyx.");
        const bytes = await downloadTelnyxRecording(source, params.apiKey);
        if (!bytes) throw new Error("Kunne ikke hente lydfilen fra Telnyx.");
        url = await putArchiveFile(archiveBlobPath(rec), bytes);
        if (!isVercelBlobUrl(url)) throw new Error("Kunne ikke gemme i Vercel Blob.");
        stats.copied += 1;
      } else {
        stats.reusedLeadCopy += 1;
      }

      const durationSeconds = recordingDurationSeconds(rec);
      const startedAt = rec.startedAt ?? new Date();
      const { direction, customerNumber } = recordingDirection(rec.fromNumber, rec.toNumber, ourNumbers);
      const { agentUserId, agentMatch } = resolveRecordingAgent({
        connectionId: rec.connectionId,
        userIdByConnectionId,
        connectionNameById,
        userIdByConnectionName,
        dialerAgentUserId: null,
        activityUserId: null,
        attemptUserId: null,
      });
      let leadId = leadCopy?.leadId ?? null;
      let leadMatch = leadCopy ? "ACTIVITY" : "NONE";
      if (!leadId) {
        const resolved = await resolveLeadContextForTelnyxRecording({
          callControlId: rec.callControlId,
          callSessionId: rec.callSessionId,
          clientStateLeadId: null,
          clientStateUserId: null,
          fromNumber: rec.fromNumber,
          toNumber: rec.toNumber,
          startedAt: rec.startedAt,
          agentUserId,
        });
        leadId = resolved.leadId;
        leadMatch =
          resolved.resolutionSource === "call_attempt"
            ? "CALL_ATTEMPT"
            : resolved.resolutionSource === "phone"
              ? "PHONE"
              : resolved.leadId
                ? "DIALER_LOG"
                : "NONE";
      }
      const lead = leadId
        ? await prisma.lead.findUnique({ where: { id: leadId }, select: { campaignId: true } })
        : null;
      if (leadId && !lead) leadId = null;

      await prisma.callRecording.upsert({
        where: { telnyxRecordingId: rec.id },
        // Rækken findes måske allerede fra Scripts & Træning — rør kun backup-URL'en.
        update: { playbackUrl: url },
        create: {
          telnyxRecordingId: rec.id,
          telnyxCallSessionId: rec.callSessionId,
          telnyxCallLegId: rec.callLegId,
          telnyxCallControlId: rec.callControlId,
          telnyxConnectionId: rec.connectionId,
          initiatedBy: str(rec.raw.initiated_by),
          channels: str(rec.raw.channels) ?? "single",
          direction,
          fromNumber: rec.fromNumber,
          toNumber: rec.toNumber,
          customerNumber,
          startedAt,
          endedAt: new Date(startedAt.getTime() + durationSeconds * 1000),
          durationSeconds,
          agentUserId,
          agentMatch,
          leadId,
          leadMatch,
          campaignId: lead?.campaignId ?? null,
          activityEventId: leadCopy?.id ?? null,
          playbackUrl: url,
          pipelineStatus: initialPipelineStatus(durationSeconds, null),
        },
      });
    } catch (err) {
      stats.errors.push({
        recordingId: rec.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  for (let i = 0; i < todo.length; i += ARCHIVE_CONCURRENCY) {
    if (params.deadlineAt && Date.now() > params.deadlineAt) {
      stats.remaining = todo.length - i;
      break;
    }
    await Promise.all(todo.slice(i, i + ARCHIVE_CONCURRENCY).map(archiveOne));
  }

  log(
    `Lydarkiv: ${stats.copied} kopieret, ${stats.reusedLeadCopy} genbrugt, ${stats.alreadyArchived} allerede gemt, ${stats.remaining} til næste kørsel, ${stats.errors.length} fejl`,
  );
  return stats;
}
