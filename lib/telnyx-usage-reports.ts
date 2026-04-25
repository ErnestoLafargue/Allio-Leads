const TELNYX_API = "https://api.telnyx.com/v2/usage_reports";

export type TelnyxUsageRow = Record<string, unknown>;

export type TelnyxUsageReportResult =
  | { ok: true; rows: TelnyxUsageRow[]; meta: unknown }
  | { ok: false; status: number; message: string };

type TelnyxUsageMeta = {
  page_size?: number;
  page_number?: number;
  total_results?: number;
  total_pages?: number;
};

/**
 * Telnyx forventer bogstavelige klammer i nøgler som `page[number]` og `filter[direction]`.
 * `URLSearchParams` encoder `[` til `%5B`, hvilket ofte giver 4xx fra usage_reports.
 */
function buildUsageReportQueryString(params: {
  product: string;
  startDateIso: string;
  endDateIsoExclusive: string;
  metrics: string;
  dimensions?: string;
  pageNumber: number;
  pageSize: number;
  extra?: Record<string, string>;
}): string {
  const parts: string[] = [
    `product=${encodeURIComponent(params.product)}`,
    `start_date=${encodeURIComponent(params.startDateIso)}`,
    `end_date=${encodeURIComponent(params.endDateIsoExclusive)}`,
    `metrics=${encodeURIComponent(params.metrics)}`,
    `page[number]=${encodeURIComponent(String(params.pageNumber))}`,
    `page[size]=${encodeURIComponent(String(params.pageSize))}`,
  ];
  if (params.dimensions) {
    parts.push(`dimensions=${encodeURIComponent(params.dimensions)}`);
  }
  if (params.extra) {
    for (const [k, v] of Object.entries(params.extra)) {
      parts.push(`${k}=${encodeURIComponent(v)}`);
    }
  }
  return parts.join("&");
}

function parseMeta(raw: unknown): TelnyxUsageMeta {
  if (!raw || typeof raw !== "object") return {};
  return raw as TelnyxUsageMeta;
}

export function rowCostUsd(row: TelnyxUsageRow): number {
  const c = row.cost;
  if (typeof c === "number" && Number.isFinite(c)) return c;
  if (typeof c === "string") {
    const n = Number(c);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function sumCostFromRows(rows: TelnyxUsageRow[]): number {
  let t = 0;
  for (const r of rows) {
    t += rowCostUsd(r);
  }
  return Math.round(t * 10000) / 10000;
}

const NUMERIC_SEC_KEYS = ["call_sec", "billed_sec", "billedCallSec", "billed_call_sec"] as const;

function rowNumber(row: TelnyxUsageRow, key: string): number {
  const v = row[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Lægger sammen et metrisk felt (typisk `call_sec` / `billed_sec`) over alle rækker
 * (alle sider er allerede flattet i `rows`).
 */
export function sumSecondsMetricFromRows(rows: TelnyxUsageRow[], preferredKeys: string[] = []): number {
  const keys = [...preferredKeys, ...NUMERIC_SEC_KEYS];
  let t = 0;
  for (const r of rows) {
    for (const k of keys) {
      if (k in r) {
        t += rowNumber(r, k);
        break;
      }
    }
  }
  return Math.round(t * 10) / 10;
}

/**
 * Telnyx Usage Reports (kræver API-nøgle med adgang til reporting).
 * Henter alle sider (`page[number]`) så total cost matcher Telnyx-portalen.
 * @see https://developers.telnyx.com/docs/reporting/usage-reports
 */
export async function fetchTelnyxUsageReport(params: {
  apiKey: string;
  product: string;
  startDateIso: string;
  endDateIsoExclusive: string;
  metrics: string;
  dimensions?: string;
  extra?: Record<string, string>;
  /** Max sider at hente (sikkerhed mod uendelig løkke) */
  maxPages?: number;
}): Promise<TelnyxUsageReportResult> {
  const pageSize = 100;
  const maxPages = params.maxPages ?? 25;
  const allRows: TelnyxUsageRow[] = [];
  let lastMeta: unknown;

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    const qs = buildUsageReportQueryString({
      product: params.product,
      startDateIso: params.startDateIso,
      endDateIsoExclusive: params.endDateIsoExclusive,
      metrics: params.metrics,
      dimensions: params.dimensions,
      pageNumber,
      pageSize,
      extra: params.extra,
    });
    const url = `${TELNYX_API}?${qs}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        Accept: "application/json",
        "User-Agent": "Allio-Leads-TelnyxCost/1.0",
      },
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: text.slice(0, 800) || `HTTP ${res.status}`,
      };
    }

    let json: { data?: unknown; meta?: unknown };
    try {
      json = JSON.parse(text) as { data?: unknown; meta?: unknown };
    } catch {
      return { ok: false, status: 500, message: "Ugyldig JSON fra Telnyx usage_reports" };
    }

    lastMeta = json.meta;
    const chunk = Array.isArray(json.data) ? json.data : [];
    for (const row of chunk) {
      if (row && typeof row === "object") allRows.push(row as TelnyxUsageRow);
    }

    const meta = parseMeta(json.meta);
    const totalPages = typeof meta.total_pages === "number" && meta.total_pages > 0 ? meta.total_pages : 1;
    if (pageNumber >= totalPages || chunk.length === 0) break;
  }

  return { ok: true, rows: allRows, meta: lastMeta };
}
