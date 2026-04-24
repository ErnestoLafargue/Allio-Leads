const TELNYX_API = "https://api.telnyx.com/v2/usage_reports";

export type TelnyxUsageRow = Record<string, unknown>;

export type TelnyxUsageReportResult =
  | { ok: true; rows: TelnyxUsageRow[]; meta: unknown }
  | { ok: false; status: number; message: string };

/**
 * Telnyx Usage Reports (kræver API-nøgle med adgang til reporting).
 * @see https://developers.telnyx.com/docs/reporting/usage-reports
 */
export async function fetchTelnyxUsageReport(params: {
  apiKey: string;
  product: string;
  /** Inklusiv — ISO med tidszone, fx ...T00:00:00.000Z */
  startDateIso: string;
  /** Eksklusiv — samme måned + 1 måned */
  endDateIsoExclusive: string;
  metrics: string;
  dimensions?: string;
  /** Ekstra query-parametre, fx { "filter[direction]": "outbound" } */
  extra?: Record<string, string>;
}): Promise<TelnyxUsageReportResult> {
  const u = new URL(TELNYX_API);
  u.searchParams.set("product", params.product);
  u.searchParams.set("start_date", params.startDateIso);
  u.searchParams.set("end_date", params.endDateIsoExclusive);
  u.searchParams.set("metrics", params.metrics);
  if (params.dimensions) u.searchParams.set("dimensions", params.dimensions);
  u.searchParams.set("page[number]", "1");
  u.searchParams.set("page[size]", "100");
  if (params.extra) {
    for (const [k, v] of Object.entries(params.extra)) {
      u.searchParams.set(k, v);
    }
  }

  const res = await fetch(u.toString(), {
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: text.slice(0, 500) || `HTTP ${res.status}`,
    };
  }
  try {
    const json = JSON.parse(text) as { data?: TelnyxUsageRow[]; meta?: unknown };
    return { ok: true, rows: Array.isArray(json.data) ? json.data : [], meta: json.meta };
  } catch {
    return { ok: false, status: 500, message: "Ugyldig JSON fra Telnyx usage_reports" };
  }
}

export function sumCostFromRows(rows: TelnyxUsageRow[]): number {
  let t = 0;
  for (const r of rows) {
    const c = r.cost;
    if (typeof c === "number" && Number.isFinite(c)) t += c;
  }
  return Math.round(t * 10000) / 10000;
}
