import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import { isLeadStatus, LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/lead-status";

const PAGE_SIZE_DEFAULT = 40;
const PAGE_SIZE_MAX = 100;
/** Korte klip (fx voicemail/ingen svar) vises ikke på Lydfiler. */
export const MIN_LYDFILER_DURATION_SECONDS = 12;

function buildLeadWhere(params: {
  q: string;
  statusFilter: string;
}): Record<string, unknown> {
  const { q, statusFilter } = params;
  const parts: Record<string, unknown>[] = [];

  if (q) {
    parts.push({
      OR: [
        { companyName: { contains: q, mode: "insensitive" as const } },
        { phone: { contains: q } },
      ],
    });
  }

  if (statusFilter && isLeadStatus(statusFilter)) {
    parts.push({ status: statusFilter });
  }

  return parts.length ? { AND: parts } : {};
}

/**
 * Lydfiler filtrerer på hvem der lavede optagelsen. Mange CALL_RECORDING-rækker
 * har userId = null, mens sælgeren ligger på CallRecording.agentUserId.
 */
async function activityMatchForAgent(agentUserId: string): Promise<Record<string, unknown>[]> {
  const linked = await prisma.callRecording.findMany({
    where: { agentUserId },
    select: { activityEventId: true, telnyxRecordingId: true, telnyxCallControlId: true },
  });
  const ids: string[] = [];
  const legs: string[] = [];
  for (const row of linked) {
    if (row.activityEventId) ids.push(row.activityEventId);
    if (row.telnyxRecordingId) legs.push(`rec:${row.telnyxRecordingId}`);
    if (row.telnyxCallControlId) legs.push(row.telnyxCallControlId);
  }
  const or: Record<string, unknown>[] = [{ userId: agentUserId }];
  if (ids.length > 0) or.push({ id: { in: ids } });
  if (legs.length > 0) or.push({ telnyxCallLegId: { in: legs } });
  return or;
}

async function agentsForUnassignedRecordings(
  rows: { id: string; user: { id: string; name: string } | null; telnyxCallLegId: string | null }[],
): Promise<Map<string, { id: string; name: string }>> {
  const out = new Map<string, { id: string; name: string }>();
  const missing = rows.filter((r) => !r.user);
  if (missing.length === 0) return out;
  const ids = missing.map((r) => r.id);
  const legs = missing.map((r) => r.telnyxCallLegId).filter((leg): leg is string => Boolean(leg));
  const recs = await prisma.callRecording.findMany({
    where: {
      agentUserId: { not: null },
      OR: [
        { activityEventId: { in: ids } },
        ...(legs.length > 0
          ? [{ telnyxCallControlId: { in: legs } }, { telnyxRecordingId: { in: legs.map((leg) => leg.replace(/^rec:/, "")) } }]
          : []),
      ],
    },
    select: {
      activityEventId: true,
      telnyxRecordingId: true,
      telnyxCallControlId: true,
      agent: { select: { id: true, name: true } },
    },
  });
  for (const rec of recs) {
    if (!rec.agent) continue;
    const agent = { id: rec.agent.id, name: rec.agent.name };
    if (rec.activityEventId && ids.includes(rec.activityEventId)) out.set(rec.activityEventId, agent);
    for (const row of missing) {
      if (!row.telnyxCallLegId) continue;
      if (
        row.telnyxCallLegId === rec.telnyxCallControlId ||
        row.telnyxCallLegId === `rec:${rec.telnyxRecordingId}`
      ) {
        out.set(row.id, agent);
      }
    }
  }
  return out;
}

export async function GET(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, Number.parseInt(searchParams.get("pageSize") || String(PAGE_SIZE_DEFAULT), 10) || PAGE_SIZE_DEFAULT),
  );
  const q = searchParams.get("q")?.trim() ?? "";
  const statusFilter = searchParams.get("status")?.trim().toUpperCase() ?? "";
  const agentUserId = searchParams.get("userId")?.trim() ?? "";
  const sort = (searchParams.get("sort") || "time").toLowerCase();
  const dir = searchParams.get("dir") === "asc" ? "asc" : "desc";

  const leadWhere = buildLeadWhere({
    q,
    statusFilter,
  });

  let orderBy:
    | { createdAt: "asc" | "desc" }
    | { lead: { companyName: "asc" | "desc" } }
    | { lead: { status: "asc" | "desc" } }
    | { lead: { campaign: { name: "asc" | "desc" } } }
    | { user: { name: "asc" | "desc" } };
  switch (sort) {
    case "company":
      orderBy = { lead: { companyName: dir } };
      break;
    case "status":
      orderBy = { lead: { status: dir } };
      break;
    case "campaign":
      orderBy = { lead: { campaign: { name: dir } } };
      break;
    case "agent":
      orderBy = { user: { name: dir } };
      break;
    default:
      orderBy = { createdAt: dir };
  }

  try {
    const agentMatch = agentUserId ? await activityMatchForAgent(agentUserId) : null;
    const where = {
      kind: LEAD_ACTIVITY_KIND.CALL_RECORDING,
      recordingUrl: { not: null },
      durationSeconds: { gte: MIN_LYDFILER_DURATION_SECONDS },
      ...(agentMatch ? { OR: agentMatch } : {}),
      ...(Object.keys(leadWhere).length > 0 ? { lead: leadWhere } : {}),
    };

    const canMergeUncoupled =
      session.user.role === "ADMIN" && !statusFilter && !agentUserId && sort === "time";
    const fetchTake = canMergeUncoupled ? page * pageSize : pageSize;
    const fetchSkip = canMergeUncoupled ? 0 : (page - 1) * pageSize;

    const [activityTotal, activityRows, uncoupledTotal, uncoupledRows] = await Promise.all([
      prisma.leadActivityEvent.count({ where }),
      prisma.leadActivityEvent.findMany({
        where,
        orderBy,
        skip: fetchSkip,
        take: fetchTake,
        select: {
          id: true,
          createdAt: true,
          durationSeconds: true,
          recordingUrl: true,
          summary: true,
          telnyxCallLegId: true,
          lead: {
            select: {
              id: true,
              companyName: true,
              phone: true,
              status: true,
              campaign: { select: { id: true, name: true } },
            },
          },
          user: { select: { id: true, name: true } },
        },
      }),
      canMergeUncoupled
        ? prisma.dialerCallLog.count({
            where: {
              recordingUrl: { not: null },
              leadId: null,
              ...(q
                ? {
                    OR: [
                      { toNumber: { contains: q } },
                      { fromNumber: { contains: q } },
                      { callControlId: { contains: q } },
                    ],
                  }
                : {}),
            },
          })
        : Promise.resolve(0),
      canMergeUncoupled
        ? prisma.dialerCallLog.findMany({
            where: {
              recordingUrl: { not: null },
              leadId: null,
              ...(q
                ? {
                    OR: [
                      { toNumber: { contains: q } },
                      { fromNumber: { contains: q } },
                      { callControlId: { contains: q } },
                    ],
                  }
                : {}),
            },
            orderBy: { startedAt: dir },
            take: fetchTake,
            select: {
              callControlId: true,
              startedAt: true,
              recordingUrl: true,
              toNumber: true,
              fromNumber: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const agentByEvent = await agentsForUnassignedRecordings(activityRows);
    const activityItems = activityRows.map((r) => {
      const st = r.lead.status;
      const statusLabel = isLeadStatus(st) ? LEAD_STATUS_LABELS[st as LeadStatus] : st;
      const agent = r.user
        ? { id: r.user.id, name: r.user.name }
        : agentByEvent.get(r.id) ?? null;
      return {
        id: r.id,
        at: r.createdAt.toISOString(),
        durationSeconds: r.durationSeconds,
        recordingUrl: r.recordingUrl,
        summary: r.summary,
        agent,
        lead: {
          id: r.lead.id,
          companyName: r.lead.companyName,
          phone: r.lead.phone,
          status: r.lead.status,
          statusLabel,
          campaign: r.lead.campaign ? { id: r.lead.campaign.id, name: r.lead.campaign.name } : null,
        },
        source: "lead" as const,
        downloadEventId: r.id,
      };
    });

    const uncoupledItems = uncoupledRows.map((r) => ({
      id: `uncoupled:${r.callControlId}`,
      at: r.startedAt.toISOString(),
      durationSeconds: null,
      recordingUrl: r.recordingUrl,
      summary: `Ukoblet Telnyx-optagelse (${r.callControlId})`,
      agent: null,
      lead: null,
      source: "uncoupled" as const,
      downloadEventId: null,
      uncoupledMeta: {
        callControlId: r.callControlId,
        toNumber: r.toNumber,
        fromNumber: r.fromNumber,
      },
    }));

    const merged = canMergeUncoupled
      ? [...activityItems, ...uncoupledItems]
          .sort((a, b) => {
            if (dir === "asc") return a.at.localeCompare(b.at);
            return b.at.localeCompare(a.at);
          })
          .slice((page - 1) * pageSize, page * pageSize)
      : activityItems;
    const total = canMergeUncoupled ? activityTotal + uncoupledTotal : activityTotal;

    return NextResponse.json({
      items: merged,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Kunne ikke hente optagelser.", details: process.env.NODE_ENV === "development" ? msg : undefined },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
