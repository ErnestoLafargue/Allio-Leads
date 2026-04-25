import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import { getCopenhagenMonthBounds } from "@/lib/copenhagen-month-bounds";
import {
  fetchTelnyxUsageReport,
  sumCostFromRows,
  sumSecondsMetricFromRows,
  type TelnyxUsageReportResult,
} from "@/lib/telnyx-usage-reports";
import { getTelnyxConnectionId } from "@/lib/telnyx-call-control";

/** Groft vekslingskurs til vejledende DKK (Telnyx fakturerer typisk i USD). */
const USD_TO_DKK_APPROX = 6.9;

/**
 * Telnyx Usage Reports kræver produkt-specifikke metrics/dimensions.
 * @see fejl 10002/10003 fra api.telnyx.com/v2/usage_reports
 */
const TELNYX_PRODUCTS: Array<{
  product: string;
  label: string;
  metrics: string;
  dimensions?: string;
}> = [
  {
    product: "call-control",
    label: "Voice API (Call Control)",
    metrics: "cost,attempted,connected,call_sec",
    dimensions: "direction",
  },
  {
    product: "amd",
    label: "Answering Machine Detection",
    metrics: "cost,invocations",
    dimensions: "date",
  },
  {
    product: "recording",
    label: "Call recording",
    metrics: "cost,call_sec,attempted,connected,billed_sec",
    dimensions: "date",
  },
  {
    product: "webrtc",
    label: "WebRTC",
    metrics: "cost,call_sec",
    dimensions: "date",
  },
];

async function fetchCallControlUsageReport(args: {
  apiKey: string;
  startDateIso: string;
  endDateIsoExclusive: string;
  metrics: string;
  dimensions?: string;
  connectionId: string | null;
}): Promise<{ r: TelnyxUsageReportResult; scopeNote?: string }> {
  const base = {
    apiKey: args.apiKey,
    product: "call-control" as const,
    startDateIso: args.startDateIso,
    endDateIsoExclusive: args.endDateIsoExclusive,
    metrics: args.metrics,
    dimensions: args.dimensions,
  };

  if (!args.connectionId) {
    const r = await fetchTelnyxUsageReport({ ...base, extra: undefined });
    return { r };
  }

  const filterOrder: Array<{ extra: Record<string, string> }> = [
    { extra: { "filter[call_control_application_id]": args.connectionId } },
    { extra: { "filter[connection_id]": args.connectionId } },
  ];

  for (const f of filterOrder) {
    const r = await fetchTelnyxUsageReport({ ...base, extra: f.extra });
    if (r.ok) {
      return { r };
    }
    if (![400, 404, 422].includes(r.status)) {
      return { r };
    }
  }

  const unscoped = await fetchTelnyxUsageReport({ ...base, extra: undefined });
  if (unscoped.ok) {
    return {
      r: unscoped,
      scopeNote:
        "Telnyx accepterede ikke filter på Call Control / app-id — tallene viser hele kontoens Voice API for perioden.",
    };
  }
  return { r: unscoped };
}

export async function GET(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const yRaw = searchParams.get("year");
  const mRaw = searchParams.get("month");
  const yearMonth =
    yRaw && mRaw
      ? { year: Number(yRaw), month: Number(mRaw) }
      : undefined;

  const bounds = await getCopenhagenMonthBounds(prisma, yearMonth);
  const { start, endExclusive } = bounds;
  const startIso = start.toISOString();
  const endIso = endExclusive.toISOString();

  const [
    outboundLeadLegs,
    leadLegsAnswered,
    leadLegsBridged,
    noAgentAbandons,
    voicemailAmd,
    recordingActivities,
    callAttempts,
    fromGroup,
    meetingsBooked,
    billableRow,
    outboundAgentLegs,
  ] = await Promise.all([
    prisma.dialerCallLog.count({
      where: { direction: "outbound-lead", startedAt: { gte: start, lt: endExclusive } },
    }),
    prisma.dialerCallLog.count({
      where: {
        direction: "outbound-lead",
        startedAt: { gte: start, lt: endExclusive },
        answeredAt: { not: null },
      },
    }),
    prisma.dialerCallLog.count({
      where: {
        direction: "outbound-lead",
        startedAt: { gte: start, lt: endExclusive },
        bridgedAt: { not: null },
      },
    }),
    prisma.dialerCallLog.count({
      where: {
        direction: "outbound-lead",
        startedAt: { gte: start, lt: endExclusive },
        hangupCause: "no_agent_available",
      },
    }),
    prisma.dialerCallLog.count({
      where: {
        direction: "outbound-lead",
        startedAt: { gte: start, lt: endExclusive },
        amdResult: { in: ["machine", "fax"] },
      },
    }),
    prisma.leadActivityEvent.count({
      where: {
        kind: LEAD_ACTIVITY_KIND.CALL_RECORDING,
        createdAt: { gte: start, lt: endExclusive },
      },
    }),
    prisma.leadActivityEvent.count({
      where: {
        kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
        createdAt: { gte: start, lt: endExclusive },
      },
    }),
    prisma.dialerCallLog.groupBy({
      by: ["fromNumber"],
      where: {
        direction: "outbound-lead",
        startedAt: { gte: start, lt: endExclusive },
        fromNumber: { not: null },
      },
    }),
    prisma.lead.count({
      where: {
        status: "MEETING_BOOKED",
        meetingBookedAt: { gte: start, lt: endExclusive },
      },
    }),
    prisma.$queryRaw<Array<{ minutes: unknown }>>`
      SELECT COALESCE(
        SUM(EXTRACT(EPOCH FROM ("endedAt" - "startedAt")) / 60.0),
        0
      )::double precision AS minutes
      FROM "DialerCallLog"
      WHERE "direction" = 'outbound-lead'
        AND "startedAt" >= ${start}
        AND "startedAt" < ${endExclusive}
        AND "endedAt" IS NOT NULL
        AND "startedAt" IS NOT NULL
    `,
    prisma.dialerCallLog.count({
      where: { direction: "outbound-agent", startedAt: { gte: start, lt: endExclusive } },
    }),
  ]);

  const billableMinutes = Number(billableRow[0]?.minutes ?? 0) || 0;
  const uniqueFromNumbers = fromGroup.filter((g) => g.fromNumber).length;

  const apiKey = process.env.TELNYX_API_KEY?.trim();
  const connectionId = getTelnyxConnectionId();

  const sections: Array<{
    label: string;
    product: string;
    ok: boolean;
    costUsd?: number;
    rows?: unknown[];
    meta?: unknown;
    message?: string;
    status?: number;
    /** Når Voice API-filter fejler og vi falder tilbage til hele kontoen */
    scopeNote?: string;
  }> = [];

  let totalTelnyxUsd = 0;
  let telnyxAllOk = true;
  let telnyxFirstError: string | null = null;
  let telnyxReportedWebrtcCallSec = 0;

  if (!apiKey) {
    telnyxAllOk = false;
    telnyxFirstError = "Mangler TELNYX_API_KEY.";
  } else {
    const settled = await Promise.all(
      TELNYX_PRODUCTS.map(async (p) => {
        const base = {
          apiKey,
          product: p.product,
          startDateIso: startIso,
          endDateIsoExclusive: endIso,
          metrics: p.metrics,
          dimensions: p.dimensions,
        };

        if (p.product === "call-control") {
          const { r, scopeNote } = await fetchCallControlUsageReport({
            apiKey,
            startDateIso: startIso,
            endDateIsoExclusive: endIso,
            metrics: p.metrics,
            dimensions: p.dimensions,
            connectionId,
          });
          return { p, r, scopeNote };
        }

        const r = await fetchTelnyxUsageReport({ ...base, extra: undefined });
        return { p, r, scopeNote: undefined as string | undefined };
      }),
    );

    for (const { p, r, scopeNote } of settled) {
      if (p.product === "webrtc" && r.ok) {
        telnyxReportedWebrtcCallSec = sumSecondsMetricFromRows(r.rows, ["call_sec"]);
      }

      if (!r.ok) {
        telnyxAllOk = false;
        if (!telnyxFirstError) telnyxFirstError = r.message;
        sections.push({
          label: p.label,
          product: p.product,
          ok: false,
          message: r.message,
          status: r.status,
        });
        continue;
      }
      const cost = sumCostFromRows(r.rows);
      totalTelnyxUsd += cost;
      sections.push({
        label: p.label,
        product: p.product,
        ok: true,
        costUsd: Math.round(cost * 10000) / 10000,
        rows: r.rows,
        meta: r.meta,
        scopeNote,
      });
    }
  }

  const totalUsdRounded = Math.round(totalTelnyxUsd * 10000) / 10000;
  const totalDkkApprox = Math.round(totalUsdRounded * USD_TO_DKK_APPROX * 100) / 100;
  const costPerMeetingDkk =
    meetingsBooked > 0 ? Math.round((totalDkkApprox / meetingsBooked) * 100) / 100 : null;

  return NextResponse.json({
    period: {
      label: bounds.labelDa,
      year: bounds.year,
      month: bounds.month,
      startUtc: startIso,
      endExclusiveUtc: endIso,
    },
    allio: {
      outboundLeadLegs,
      leadCallsAnswered: leadLegsAnswered,
      leadBridgesCompleted: leadLegsBridged,
      abandonNoAgent: noAgentAbandons,
      amdVoicemailOrFax: voicemailAmd,
      outboundAgentBridgeLegs: outboundAgentLegs,
      callAttemptActivities: callAttempts,
      savedRecordingActivities: recordingActivities,
      approximateBillableMinutesOutboundLead: Math.round(billableMinutes * 10) / 10,
      uniqueCliNumbersUsed: uniqueFromNumbers,
      /** Når Allio-logs mangler: sekunder som Telnyx rapporterer for produktet `webrtc` (≈ minutter/60) */
      telnyxReportedWebrtcCallSec: Math.round(telnyxReportedWebrtcCallSec * 10) / 10,
    },
    meetings: { bookedInMonth: meetingsBooked },
    telnyx: {
      apiConfigured: Boolean(apiKey),
      allReportsOk: telnyxAllOk && Boolean(apiKey),
      error: telnyxFirstError,
      totalCostUsd: totalUsdRounded,
      totalCostDkkApprox: totalDkkApprox,
      costPerMeetingBookedDkkApprox: costPerMeetingDkk,
      sections,
    },
    disclaimer:
      "Telnyx‑beløb hentes fra Telnyx Usage Reports (typisk USD). DKK er vejledende (ca. kurs). Moms og endelig faktura findes i Telnyx Mission Control. Allio‑tællere følger kalendermåned i Europe/Copenhagen ud fra jeres egne log‑tabeller.",
  });
}

export const runtime = "nodejs";
/** Telnyx kan kræve mange sider (op til 4 produkter); undgå 10s default-timeout på Vercel. */
export const maxDuration = 60;
