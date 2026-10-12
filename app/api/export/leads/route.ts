import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  contentDispositionAttachment,
  generateExportCsv,
  generateExportXlsx,
} from "@/lib/data-export/formats";
import {
  buildOutcomeExportRows,
  countLeadsByOutcome,
  fetchLeadsByOutcome,
  outcomeExportFilenameBase,
  parseCampaignIds,
  parseExportStatuses,
  type OutcomeExportFilters,
} from "@/lib/data-export/leads-by-outcome";

function parseFilters(searchParams: URLSearchParams): OutcomeExportFilters | { error: string } {
  const parsed = parseExportStatuses(searchParams.get("status"));
  if ("error" in parsed) return parsed;
  return {
    statuses: parsed.statuses,
    campaignIds: parseCampaignIds(searchParams.get("campaignId")),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  };
}

export async function GET(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (session!.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Kun administrator" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const filtersOrError = parseFilters(searchParams);
  if ("error" in filtersOrError) {
    return NextResponse.json({ error: filtersOrError.error }, { status: 400 });
  }
  const filters = filtersOrError;

  const countOnly =
    searchParams.get("countOnly") === "1" || searchParams.get("preview") === "1";
  if (countOnly) {
    const count = await countLeadsByOutcome(filters);
    return NextResponse.json({ count, statuses: filters.statuses });
  }

  const format = (searchParams.get("format") ?? "xlsx").toLowerCase().trim();
  if (format !== "csv" && format !== "xlsx") {
    return NextResponse.json({ error: "Angiv format=csv eller format=xlsx" }, { status: 400 });
  }

  const leads = await fetchLeadsByOutcome(filters);
  const { headers, rows } = buildOutcomeExportRows(leads, filters.statuses);
  const base = outcomeExportFilenameBase(filters.statuses);

  if (format === "csv") {
    const buf = generateExportCsv(headers, rows);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDispositionAttachment(`${base}.csv`),
        "X-Export-Row-Count": String(rows.length),
      },
    });
  }

  const buf = generateExportXlsx(headers, rows);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDispositionAttachment(`${base}.xlsx`),
      "X-Export-Row-Count": String(rows.length),
    },
  });
}
