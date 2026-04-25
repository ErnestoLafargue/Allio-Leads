import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import { getCopenhagenMonthBounds } from "@/lib/copenhagen-month-bounds";
import {
  fetchTelnyxUsageReport,
  sumCostFromRows,
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

  if (!apiKey) {
    telnyxAllOk = false;
    telnyxFirstError = "Mangler TELNYX_API_KEY.";
  } else {
    for (const p of TELNYX_PRODUCTS) {
      const base = {
        apiKey,
        product: p.product,
        startDateIso: startIso,
        endDateIsoExclusive: endIso,
        metrics: p.metrics,
        dimensions: p.dimensions,
      };

      let r: TelnyxUsageReportResult;
      let scopeNote: string | undefined;

      if (p.product === "call-control" && connectionId) {
        r = await fetchTelnyxUsageReport({
          ...base,
          extra: { "filter[connection_id]": connectionId },
        });
        if (!r.ok && [400, 404, 422].includes(r.status)) {
          const retry = await fetchTelnyxUsageReport({ ...base, extra: undefined });
          if (retry.ok) {
            r = retry;
            scopeNote =
              "Telnyx accepterede ikke filter på Call Control-id — tallene viser hele kontoens Voice API for perioden.";
          }
        }
      } else {
        r = await fetchTelnyxUsageReport({ ...base, extra: undefined });
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
