/**
 * Backfill af tidligere Telnyx-optagelser → LeadActivityEvent (CALL_RECORDING).
 *
 * Henter `GET /v2/recordings` paginerin, finder leadId via `client_state` eller
 * via vores `DialerCallLog` (callControlId / callSessionId), og opretter en
 * afspilbar aktivitetslinje. Forsøger derudover at kopiere selve lydfilen til
 * Vercel Blob, så links ikke udløber, jf. webhook-flowet.
 *
 * Kører i Vercel Function (Node) — sat til kort kørsel pr. invocation; admin-
 * panelet kan kalde den flere gange (kursorbaseret) for at gå gennem alle sider.
 */
import { prisma } from "@/lib/prisma";
import { decodeDialerClientState } from "@/lib/dialer-shared";
import { LEAD_ACTIVITY_KIND, formatPhoneForActivitySummary } from "@/lib/lead-activity-kinds";
import { persistTelnyxRecordingToAllio } from "@/lib/telnyx-recording-storage";
import { resolveLeadContextForTelnyxRecording } from "@/lib/telnyx-recording-lead-resolve";
import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";

const TELNYX_API_BASE = "https://api.telnyx.com/v2";

export type TelnyxRecording = {
  id: string;
  callControlId: string | null;
  callLegId: string | null;
  callSessionId: string | null;
  clientState: string | null;
  /** mp3 foretrækkes til afspilning i browser; ellers wav som fallback. */
  mp3Url: string | null;
  wavUrl: string | null;
  durationMillis: number | null;
  status: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  /** ISO af created_at (eller recording_started_at som fallback). */
  createdAtIso: string | null;
  raw: Record<string, unknown>;
};

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeRecording(d: Record<string, unknown>): TelnyxRecording | null {
  const id = asString(d.id);
  if (!id) return null;
  const downloadUrls = (d.download_urls && typeof d.download_urls === "object"
    ? (d.download_urls as Record<string, unknown>)
    : null) ?? null;
  const recordingUrls = (d.recording_urls && typeof d.recording_urls === "object"
    ? (d.recording_urls as Record<string, unknown>)
    : null) ?? null;
  const mp3Url =
    asString(downloadUrls?.mp3) ?? asString(recordingUrls?.mp3) ?? null;
  const wavUrl =
    asString(downloadUrls?.wav) ?? asString(recordingUrls?.wav) ?? null;
  return {
    id,
    callControlId: asString(d.call_control_id),
    callLegId: asString(d.call_leg_id),
    callSessionId: asString(d.call_session_id),
    clientState: asString(d.client_state),
    mp3Url,
    wavUrl,
    durationMillis: asNumber(d.duration_millis),
    status: asString(d.status),
    fromNumber: asString(d.from),
    toNumber: asString(d.to),
    createdAtIso:
      asString(d.created_at) ??
      asString(d.recording_started_at) ??
      asString(d.recording_ended_at),
    raw: d,
  };
}

export type TelnyxRecordingsListResult =
  | {
      ok: true;
      recordings: TelnyxRecording[];
      page: { number: number; size: number; totalPages: number | null };
      raw: unknown;
    }
  | { ok: false; status: number; message: string; raw?: unknown };

/**
 * GET /v2/recordings — én side pr. kald. Telnyx: filter[created_at], call_session_id, m.m.
 */
export async function listTelnyxRecordings(params: {
  apiKey: string;
  pageNumber?: number;
  pageSize?: number;
  fromIso?: string | null;
  toIso?: string | null;
  filterCallSessionId?: string | null;
  filterCallControlId?: string | null;
  filterFrom?: string | null;
  filterTo?: string | null;
}): Promise<TelnyxRecordingsListResult> {
  const qs = new URLSearchParams();
  qs.set("page[number]", String(Math.max(1, params.pageNumber ?? 1)));
  qs.set("page[size]", String(Math.min(250, Math.max(1, params.pageSize ?? 100))));
  if (params.fromIso) qs.set("filter[created_at][gte]", params.fromIso);
  if (params.toIso) qs.set("filter[created_at][lte]", params.toIso);
  if (params.filterCallSessionId) qs.set("filter[call_session_id]", params.filterCallSessionId);
  if (params.filterCallControlId) qs.set("filter[call_control_id]", params.filterCallControlId);
  if (params.filterFrom) qs.set("filter[from]", params.filterFrom);
  if (params.filterTo) qs.set("filter[to]", params.filterTo);

  let res: Response;
  try {
    res = await fetch(`${TELNYX_API_BASE}/recordings?${qs.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        Accept: "application/json",
      },
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Netværksfejl mod Telnyx.",
    };
  }
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  if (text && text.trim().startsWith("{")) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    const snippet = text.length > 300 ? `${text.slice(0, 300)}…` : text;
    return {
      ok: false,
      status: res.status,
      message: snippet ? `Telnyx HTTP ${res.status} — ${snippet}` : `Telnyx HTTP ${res.status}`,
      raw: json ?? text,
    };
  }

  const data =
    json && typeof json === "object" && "data" in json
      ? (json as { data: unknown }).data
      : [];
  const meta =
    json && typeof json === "object" && "meta" in json
      ? ((json as { meta?: Record<string, unknown> }).meta ?? null)
      : null;

  const recordings: TelnyxRecording[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === "object") {
        const r = normalizeRecording(item as Record<string, unknown>);
        if (r) recordings.push(r);
      }
    }
  }

  const totalPages = meta && typeof meta.total_pages === "number" ? meta.total_pages : null;
  return {
    ok: true,
    recordings,
    page: {
      number: params.pageNumber ?? 1,
      size: params.pageSize ?? 100,
      totalPages,
    },
    raw: json,
  };
}

export type BackfillStats = {
  scanned: number;
  /** Optagelser hvor vi fandt et lead (gemt i Allio). */
  matched: number;
  created: number;
  updated: number;
  copiedToBlob: number;
  /** Optagelser hvor vi ikke kunne knytte et lead — ikke en fejl, bare bemærket. */
  uncoupled: number;
  errors: { recordingId: string; message: string }[];
};

function emptyStats(): BackfillStats {
  return {
    scanned: 0,
    matched: 0,
    created: 0,
    updated: 0,
    copiedToBlob: 0,
    uncoupled: 0,
    errors: [],
  };
}

export function mergeBackfillStats(a: BackfillStats, b: BackfillStats): BackfillStats {
  return {
    scanned: a.scanned + b.scanned,
    matched: a.matched + b.matched,
    created: a.created + b.created,
    updated: a.updated + b.updated,
    copiedToBlob: a.copiedToBlob + b.copiedToBlob,
    uncoupled: a.uncoupled + b.uncoupled,
    errors: [...a.errors, ...b.errors].slice(-50),
  };
}

async function findLeadIdForRecording(rec: TelnyxRecording): Promise<{
  leadId: string | null;
  campaignId: string | null;
  agentUserId: string | null;
  source:
    | "client_state"
    | "call_control_log"
    | "call_session_log"
    | "bridge"
    | "phone_match"
    | "none";
}> {
  const cs = decodeDialerClientState(rec.clientState);
  if (cs?.leadId) {
    return {
      leadId: cs.leadId,
      campaignId: cs.campaignId ?? null,
      agentUserId: cs.userId ?? null,
      source: "client_state",
    };
  }

  const resolved = await resolveLeadContextForTelnyxRecording({
    callControlId: rec.callControlId,
    callSessionId: rec.callSessionId,
    clientStateLeadId: null,
    clientStateUserId: cs?.userId ?? null,
    fromNumber: rec.fromNumber,
    toNumber: rec.toNumber,
  });

  if (!resolved.leadId) {
    return { leadId: null, campaignId: null, agentUserId: null, source: "none" };
  }

  const sourceMap: Record<
    string,
    "call_control_log" | "call_session_log" | "bridge" | "phone_match" | "none"
  > = {
    call_control: "call_control_log",
    call_session: "call_session_log",
    bridge: "bridge",
    phone: "phone_match",
    none: "none",
    client_state: "none",
  };
  const source = sourceMap[resolved.resolutionSource] ?? "none";

  const leadRow = await prisma.lead.findUnique({
    where: { id: resolved.leadId },
    select: { campaignId: true },
  });

  return {
    leadId: resolved.leadId,
    campaignId: leadRow?.campaignId ?? null,
    agentUserId: resolved.agentUserId,
    source,
  };
}

type LocatedLead = Awaited<ReturnType<typeof findLeadIdForRecording>>;

async function processOneRecording(
  rec: TelnyxRecording,
  options: {
    dryRun: boolean;
    copyToBlob: boolean;
    /** default true — sæt false når forælderen allerede tæller scanned (fx per-lead backfill). */
    countScanned?: boolean;
    /** Hvis sat, springer vi ekstra findLeadIdForRecording-lookup over. */
    located?: LocatedLead;
  },
  stats: BackfillStats,
): Promise<void> {
  if (options.countScanned !== false) stats.scanned += 1;

  const located = options.located ?? (await findLeadIdForRecording(rec));
  if (!located.leadId) {
    if (!options.located) stats.uncoupled += 1;
    return;
  }
  stats.matched += 1;

  const playbackSourceUrl = rec.mp3Url ?? rec.wavUrl;
  if (!playbackSourceUrl) {
    stats.errors.push({
      recordingId: rec.id,
      message: "Ingen download-URL (hverken mp3 eller wav).",
    });
    return;
  }

  const durationSeconds =
    rec.durationMillis !== null ? Math.max(0, Math.round(rec.durationMillis / 1000)) : null;
  const lead = await prisma.lead.findUnique({
    where: { id: located.leadId },
    select: { phone: true },
  });
  const phoneLabel = lead?.phone ? formatPhoneForActivitySummary(lead.phone) : "";
  const durationLabel =
    durationSeconds !== null
      ? `${Math.floor(durationSeconds / 60)}:${(durationSeconds % 60).toString().padStart(2, "0")}`
      : null;

  // Find evt. agent-navn for at få samme summary-format som live-flowet
  let agentName: string | null = null;
  if (located.agentUserId) {
    const u = await prisma.user.findUnique({
      where: { id: located.agentUserId },
      select: { name: true },
    });
    agentName = u?.name ?? null;
  }

  const summaryParts: string[] = [];
  if (agentName) summaryParts.push(`${agentName} talte med leadet`);
  else summaryParts.push("Samtale optaget (backfill)");
  if (phoneLabel) summaryParts.push(`(${phoneLabel})`);
  if (durationLabel) summaryParts.push(`— varighed ${durationLabel}`);
  const summary = summaryParts.join(" ");

  // Idempotens: brug telnyxCallLegId = callControlId hvis vi har det,
  // ellers brug recording-id'et (sat med "rec:" prefix så vi ikke kolliderer
  // med live-leg-id fra webhook-flowet).
  const idempotencyLegId = rec.callControlId || `rec:${rec.id}`;

  const existing = await prisma.leadActivityEvent.findFirst({
    where: { leadId: located.leadId, telnyxCallLegId: idempotencyLegId },
    select: { id: true, recordingUrl: true },
  });

  if (options.dryRun) {
    if (existing) stats.updated += 1;
    else stats.created += 1;
    return;
  }

  // Forsøg at kopiere lyden til Vercel Blob så afspilning ikke afhænger af
  // udløbende Telnyx-download-links (samme persist som live-flowet).
  let playbackUrl = playbackSourceUrl;
  if (options.copyToBlob && rec.mp3Url) {
    try {
      const persisted = await persistTelnyxRecordingToAllio({
        telnyxMp3Url: rec.mp3Url,
        leadId: located.leadId,
        callControlId: rec.callControlId || `rec_${rec.id}`,
      });
      if (persisted.storedOnAllio && persisted.playbackUrl !== rec.mp3Url) {
        playbackUrl = persisted.playbackUrl;
        stats.copiedToBlob += 1;
      }
    } catch (err) {
      stats.errors.push({
        recordingId: rec.id,
        message:
          "Blob copy fejlede — gemmer Telnyx-URL: " +
          (err instanceof Error ? err.message : String(err)),
      });
    }
  }

  if (existing) {
    await prisma.leadActivityEvent.update({
      where: { id: existing.id },
      data: {
        summary,
        recordingUrl: playbackUrl,
        durationSeconds,
        userId: located.agentUserId,
      },
    });
    stats.updated += 1;
  } else {
    await prisma.leadActivityEvent.create({
      data: {
        leadId: located.leadId,
        userId: located.agentUserId,
        kind: LEAD_ACTIVITY_KIND.CALL_RECORDING,
        summary,
        recordingUrl: playbackUrl,
        durationSeconds,
        telnyxCallLegId: idempotencyLegId,
      },
    });
    stats.created += 1;
  }

  // Hvis vi har et matchende DialerCallLog, opdatér også dets recordingUrl
  if (rec.callControlId) {
    await prisma.dialerCallLog.updateMany({
      where: { callControlId: rec.callControlId },
      data: { recordingUrl: playbackUrl },
    });
  }
  if (rec.callSessionId && located.leadId) {
    await prisma.dialerCallLog.updateMany({
      where: {
        callSessionId: rec.callSessionId,
        direction: "outbound-lead",
        leadId: located.leadId,
      },
      data: { recordingUrl: playbackUrl },
    });
  }
}

export type BackfillRunResult = {
  stats: BackfillStats;
  /** Næste sidetal at hente — null når alle sider er behandlet i dette kald. */
  nextPage: number | null;
  pagesProcessed: number;
  /** Total side-antal hvis Telnyx oplyser det. */
  totalPages: number | null;
  /** Per-lead: næste offset i DialerCallLog-sessionlisten, eller null når færdig. */
  nextSessionBatchStart: number | null;
  /** Per-lead: antal kendte call_session_id for leadet. */
  totalSessions: number;
};

/**
 * Kører backfill side for side. `maxPages` er en sikring så ét kald ikke timer ud
 * i Vercel Functions; admin-panelet kan kalde igen med næste side-cursor.
 */
export async function runRecordingsBackfill(params: {
  apiKey: string;
  startPage?: number;
  pageSize?: number;
  maxPages?: number;
  fromIso?: string | null;
  toIso?: string | null;
  dryRun?: boolean;
  copyToBlob?: boolean;
}): Promise<{ ok: true; result: BackfillRunResult } | { ok: false; status: number; message: string }> {
  const stats = emptyStats();
  const pageSize = params.pageSize ?? 100;
  const maxPages = Math.max(1, params.maxPages ?? 5);
  let page = Math.max(1, params.startPage ?? 1);
  let pagesProcessed = 0;
  let lastTotalPages: number | null = null;

  for (let i = 0; i < maxPages; i++) {
    const list = await listTelnyxRecordings({
      apiKey: params.apiKey,
      pageNumber: page,
      pageSize,
      fromIso: params.fromIso ?? null,
      toIso: params.toIso ?? null,
    });
    if (!list.ok) {
      return { ok: false, status: list.status || 502, message: list.message };
    }
    pagesProcessed += 1;
    lastTotalPages = list.page.totalPages ?? lastTotalPages;

    for (const rec of list.recordings) {
      try {
        await processOneRecording(
          rec,
          {
            dryRun: Boolean(params.dryRun),
            copyToBlob: params.copyToBlob !== false,
          },
          stats,
        );
      } catch (err) {
        stats.errors.push({
          recordingId: rec.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Stop når siden var ufuldstændig (sidste side) eller tom.
    if (list.recordings.length < pageSize) {
      return {
        ok: true,
        result: {
          stats,
          nextPage: null,
          pagesProcessed,
          totalPages: lastTotalPages,
          nextSessionBatchStart: null,
          totalSessions: 0,
        },
      };
    }
    page += 1;
  }

  return {
    ok: true,
    result: {
      stats,
      nextPage: page,
      pagesProcessed,
      totalPages: lastTotalPages,
      nextSessionBatchStart: null,
      totalSessions: 0,
    },
  };
}

const MAX_SESSION_RECORDING_PAGES = 25;
const MAX_PHONE_FILTER_PAGES = 8;

/**
 * Som `runRecordingsBackfill`, men kun optagelser der kan knyttes til ét bestemt lead.
 * Henter målrettet via `call_session_id` fra `DialerCallLog` og via Telnyx `filter[to]/[from]`
 * på leadets nummer — ikke den globale nyeste-side-liste.
 */
export async function runRecordingsBackfillForLead(params: {
  apiKey: string;
  leadId: string;
  pageSize?: number;
  maxPages?: number;
  fromIso?: string | null;
  toIso?: string | null;
  dryRun?: boolean;
  copyToBlob?: boolean;
  /** Antal session-IDs der queries mod Telnyx pr. invocation. */
  maxSessionQueries?: number;
  /** Offset i sorteret session-liste (fortsæt med `nextSessionBatchStart` fra forrige svar). */
  sessionBatchStart?: number;
  /** Max sider pr. retning for telefonfiltrering (to + from). */
  maxPhonePages?: number;
  /** Sæt false når kun yderligere session-batches hentes (undgå duplikate Telnyx-kald). */
  includePhoneFilters?: boolean;
}): Promise<{ ok: true; result: BackfillRunResult } | { ok: false; status: number; message: string }> {
  const stats = emptyStats();
  const pageSize = Math.min(250, Math.max(1, params.pageSize ?? 100));
  const maxPhonePages = Math.min(20, Math.max(1, params.maxPhonePages ?? MAX_PHONE_FILTER_PAGES));
  const maxSessionQueries = Math.min(80, Math.max(1, params.maxSessionQueries ?? 30));
  const sessionBatchStart = Math.max(0, Math.floor(params.sessionBatchStart ?? 0));
  const fromIso = params.fromIso ?? null;
  const toIso = params.toIso ?? null;

  const lead = await prisma.lead.findUnique({
    where: { id: params.leadId },
    select: { phone: true },
  });
  if (!lead) {
    return { ok: false, status: 404, message: "Lead ikke fundet." };
  }

  const sessionGroups = await prisma.dialerCallLog.groupBy({
    by: ["callSessionId"],
    where: { leadId: params.leadId, callSessionId: { not: null } },
    _max: { startedAt: true },
  });

  const sortedSessions = sessionGroups
    .filter((g): g is typeof g & { callSessionId: string } => g.callSessionId != null)
    .sort((a, b) => {
      const ta = a._max.startedAt?.getTime() ?? 0;
      const tb = b._max.startedAt?.getTime() ?? 0;
      return tb - ta;
    });

  const totalSessions = sortedSessions.length;
  const sessionBatch = sortedSessions.slice(sessionBatchStart, sessionBatchStart + maxSessionQueries);
  const nextSessionBatchStart =
    sessionBatchStart + sessionBatch.length < totalSessions
      ? sessionBatchStart + sessionBatch.length
      : null;

  const byId = new Map<string, TelnyxRecording>();
  let pagesProcessed = 0;
  let lastTotalPages: number | null = null;

  for (const row of sessionBatch) {
    const sid = row.callSessionId;
    let page = 1;
    for (;;) {
      const list = await listTelnyxRecordings({
        apiKey: params.apiKey,
        pageNumber: page,
        pageSize,
        fromIso,
        toIso,
        filterCallSessionId: sid,
      });
      if (!list.ok) {
        return { ok: false, status: list.status || 502, message: list.message };
      }
      pagesProcessed += 1;
      lastTotalPages = list.page.totalPages ?? lastTotalPages;
      for (const rec of list.recordings) {
        byId.set(rec.id, rec);
      }
      if (list.recordings.length < pageSize) break;
      page += 1;
      if (page > MAX_SESSION_RECORDING_PAGES) break;
    }
  }

  const includePhoneFilters = params.includePhoneFilters !== false;
  const e164 = normalizePhoneToE164ForDial(lead.phone ?? "");
  if (includePhoneFilters && e164) {
    for (const filterTo of [true, false] as const) {
      let page = 1;
      for (let i = 0; i < maxPhonePages; i++) {
        const list = await listTelnyxRecordings({
          apiKey: params.apiKey,
          pageNumber: page,
          pageSize,
          fromIso,
          toIso,
          filterTo: filterTo ? e164 : null,
          filterFrom: filterTo ? null : e164,
        });
        if (!list.ok) {
          return { ok: false, status: list.status || 502, message: list.message };
        }
        pagesProcessed += 1;
        lastTotalPages = list.page.totalPages ?? lastTotalPages;
        for (const rec of list.recordings) {
          byId.set(rec.id, rec);
        }
        if (list.recordings.length < pageSize) break;
        page += 1;
      }
    }
  }

  const sorted = Array.from(byId.values()).sort((a, b) => {
    const ta = a.createdAtIso ? Date.parse(a.createdAtIso) : 0;
    const tb = b.createdAtIso ? Date.parse(b.createdAtIso) : 0;
    return tb - ta;
  });

  for (const rec of sorted) {
    stats.scanned += 1;
    try {
      const located = await findLeadIdForRecording(rec);
      if (!located.leadId || located.leadId !== params.leadId) continue;
      await processOneRecording(
        rec,
        {
          dryRun: Boolean(params.dryRun),
          copyToBlob: params.copyToBlob !== false,
          countScanned: false,
          located,
        },
        stats,
      );
    } catch (err) {
      stats.errors.push({
        recordingId: rec.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    ok: true,
    result: {
      stats,
      nextPage: null,
      pagesProcessed,
      totalPages: lastTotalPages,
      nextSessionBatchStart,
      totalSessions,
    },
  };
}
