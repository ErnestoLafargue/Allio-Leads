import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import { isLeadStatus, LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/lead-status";

const PAGE_SIZE_DEFAULT = 40;
const PAGE_SIZE_MAX = 100;

function buildLeadWhere(params: {
  role: string;
  userId: string;
  q: string;
  statusFilter: string;
}): Record<string, unknown> {
  const { role, userId, q, statusFilter } = params;
  const parts: Record<string, unknown>[] = [];

  if (role !== "ADMIN") {
    parts.push({
      OR: [{ status: { not: "CALLBACK_SCHEDULED" as const } }, { callbackReservedByUserId: userId }],
    });
    parts.push({
      OR: [{ status: { not: "MEETING_BOOKED" as const } }, { bookedByUserId: userId }],
    });
  }

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
  const sort = (searchParams.get("sort") || "time").toLowerCase();
  const dir = searchParams.get("dir") === "asc" ? "asc" : "desc";

  const leadWhere = buildLeadWhere({
    role: session.user.role,
    userId: session.user.id,
    q,
    statusFilter,
  });

  const where = {
    kind: LEAD_ACTIVITY_KIND.CALL_RECORDING,
    recordingUrl: { not: null },
    ...(Object.keys(leadWhere).length > 0 ? { lead: leadWhere } : {}),
  };

  let orderBy:
    | { createdAt: "asc" | "desc" }
    | { lead: { companyName: "asc" | "desc" } }
    | { lead: { status: "asc" | "desc" } }
    | { user: { name: "asc" | "desc" } };
  switch (sort) {
    case "company":
      orderBy = { lead: { companyName: dir } };
      break;
    case "status":
      orderBy = { lead: { status: dir } };
      break;
    case "agent":
      orderBy = { user: { name: dir } };
      break;
    default:
      orderBy = { createdAt: dir };
  }

  try {
    const [total, rows] = await Promise.all([
      prisma.leadActivityEvent.count({ where }),
      prisma.leadActivityEvent.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          createdAt: true,
          durationSeconds: true,
          recordingUrl: true,
          summary: true,
          lead: {
            select: {
              id: true,
              companyName: true,
              phone: true,
              status: true,
            },
          },
          user: { select: { id: true, name: true } },
        },
      }),
    ]);

    const items = rows.map((r) => {
      const st = r.lead.status;
      const statusLabel = isLeadStatus(st) ? LEAD_STATUS_LABELS[st as LeadStatus] : st;
      return {
        id: r.id,
        at: r.createdAt.toISOString(),
        durationSeconds: r.durationSeconds,
        recordingUrl: r.recordingUrl,
        summary: r.summary,
        agent: r.user ? { id: r.user.id, name: r.user.name } : null,
        lead: {
          id: r.lead.id,
          companyName: r.lead.companyName,
          phone: r.lead.phone,
          status: r.lead.status,
          statusLabel,
        },
      };
    });

    return NextResponse.json({
      items,
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
