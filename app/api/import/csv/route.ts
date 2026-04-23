import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";
import { parseFieldConfig } from "@/lib/campaign-fields";
import { stringifyCustomFields } from "@/lib/custom-fields";
import { getUploadedBlob, uploadFilename } from "@/lib/form-upload";
import { parseImportFile } from "@/lib/import-parse";
import { buildNormRow } from "@/lib/import-parse-helpers";
import { pickLeadCreateData } from "@/lib/prisma-lead-write";
import {
  applyColumnMapping,
  collectCustomFromRow,
  pickBaseFromNorm,
  type MappingRecord,
} from "@/lib/import-mapping";
import {
  indexLeadsByNormalizedCvr,
  normalizeCVR,
  type ImportDetailRow,
} from "@/lib/cvr-import";

const MAX_DETAIL_ROWS = 200;

export type CsvImportResponse = {
  totalRows: number;
  newLeadsImported: number;
  existingAttached: number;
  skippedDuplicateInFile: number;
  skippedAlreadyInCampaign: number;
  skippedInvalid: number;
  details: ImportDetailRow[];
};

export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const form = await req.formData();
  const file = form.get("file");
  const campaignIdRaw = form.get("campaignId");
  const campaignId = typeof campaignIdRaw === "string" ? campaignIdRaw.trim() : "";
  const mappingRaw = form.get("mapping");
  const includeExistingCvrs = form.get("includeExistingCvrs") === "1";
  const allowMissingCvr = form.get("allowMissingCvr") === "1";
  const allowMissingCompanyName = form.get("allowMissingCompanyName") === "1";
  let mapping: MappingRecord | null = null;
  if (typeof mappingRaw === "string" && mappingRaw.trim()) {
    try {
      mapping = JSON.parse(mappingRaw) as MappingRecord;
    } catch {
      return NextResponse.json({ error: "Ugyldig mapping JSON" }, { status: 400 });
    }
  }

  const blob = getUploadedBlob(file);
  if (!blob) {
    return NextResponse.json({ error: "Upload en CSV- eller Excel-fil" }, { status: 400 });
  }
  const uploadName = uploadFilename(blob);
  if (!campaignId) {
    return NextResponse.json({ error: "Vælg en kampagne" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    return NextResponse.json({ error: "Kampagne findes ikke" }, { status: 400 });
  }

  const fieldCfg = parseFieldConfig(campaign.fieldConfig);

  const parsed = await parseImportFile(blob, uploadName);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, details: parsed.details }, { status: 400 });
  }

  const rows = parsed.rows;

  const existingLeads = await prisma.lead.findMany({
    select: { id: true, campaignId: true, cvr: true, status: true },
  });
  let cvrToLead = indexLeadsByNormalizedCvr(existingLeads);

  const encoder = new TextEncoder();
  const totalRows = rows.length;

  function eventLine(payload: Record<string, unknown>) {
    return encoder.encode(`${JSON.stringify(payload)}\n`);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const summary: CsvImportResponse = {
        totalRows,
        newLeadsImported: 0,
        existingAttached: 0,
        skippedDuplicateInFile: 0,
        skippedAlreadyInCampaign: 0,
        skippedInvalid: 0,
        details: [],
      };
      const handledCvrsInFile = new Set<string>();
      const progressStep = Math.max(1, Math.floor(totalRows / 100));

      function pushDetail(row: ImportDetailRow) {
        if (summary.details.length < MAX_DETAIL_ROWS) summary.details.push(row);
      }
      function pushProgress(processed: number) {
        const percent = totalRows === 0 ? 100 : Math.min(100, Math.round((processed / totalRows) * 100));
        controller.enqueue(
          eventLine({
            type: "progress",
            processedRows: processed,
            totalRows,
            percent,
          }),
        );
      }

      try {
        pushProgress(0);
        for (let i = 0; i < rows.length; i++) {
          const dataRow = i + 1;
          const row = rows[i];
          const n =
            mapping && Object.keys(mapping).length > 0
              ? applyColumnMapping(row, mapping)
              : buildNormRow(row);
          const base = pickBaseFromNorm(n);
          const cvrNorm = normalizeCVR(base.cvr);

          if (!cvrNorm && !allowMissingCvr) {
            summary.skippedInvalid += 1;
            pushDetail({
              dataRow,
              cvr: base.cvr?.trim() ? base.cvr.trim() : "—",
              reason: "invalid_row",
              note: "Manglende eller ugyldigt CVR (8 cifre efter normalisering)",
            });
          } else if (cvrNorm && handledCvrsInFile.has(cvrNorm)) {
            summary.skippedDuplicateInFile += 1;
            pushDetail({ dataRow, cvr: cvrNorm, reason: "duplicate_in_file" });
          } else {
            const existing = cvrNorm ? cvrToLead.get(cvrNorm) : null;
            if (existing && cvrNorm) {
              if (existing.status === "NOT_INTERESTED" || existing.status === "UNQUALIFIED") {
                summary.skippedInvalid += 1;
                handledCvrsInFile.add(cvrNorm);
                pushDetail({
                  dataRow,
                  cvr: cvrNorm,
                  reason: "invalid_row",
                  note: "Findes allerede med udfald Ikke interesseret/Ukvalificeret",
                });
              } else if (!includeExistingCvrs) {
                summary.skippedAlreadyInCampaign += 1;
                handledCvrsInFile.add(cvrNorm);
                pushDetail({
                  dataRow,
                  cvr: cvrNorm,
                  reason: "already_in_campaign",
                  note: "Findes allerede i systemet",
                });
              } else if (existing.campaignId === campaignId) {
                summary.skippedAlreadyInCampaign += 1;
                handledCvrsInFile.add(cvrNorm);
                pushDetail({ dataRow, cvr: cvrNorm, reason: "already_in_campaign" });
              } else {
                await prisma.lead.update({
                  where: { id: existing.id },
                  data: { campaignId },
                });
                cvrToLead.set(cvrNorm, { id: existing.id, campaignId, status: existing.status });
                summary.existingAttached += 1;
                handledCvrsInFile.add(cvrNorm);
              }
            } else if (!base.companyName?.trim() && !allowMissingCompanyName) {
              summary.skippedInvalid += 1;
              pushDetail({
                dataRow,
                cvr: cvrNorm ?? "—",
                reason: "invalid_row",
                note: "Virksomhedsnavn mangler (påkrævet for nye leads)",
              });
            } else {
              const custom = collectCustomFromRow(n, fieldCfg);
              const created = await prisma.lead.create({
                data: pickLeadCreateData({
                  campaignId,
                  companyName: base.companyName?.trim() || "(Uden virksomhedsnavn)",
                  phone: base.phone,
                  email: base.email,
                  cvr: cvrNorm ?? "",
                  address: base.address,
                  postalCode: base.postalCode,
                  city: base.city,
                  industry: base.industry,
                  notes: base.notes,
                  customFields: stringifyCustomFields(custom),
                  status: "NEW",
                }),
              });
              if (cvrNorm) {
                cvrToLead.set(cvrNorm, { id: created.id, campaignId, status: "NEW" });
                handledCvrsInFile.add(cvrNorm);
              }
              summary.newLeadsImported += 1;
            }
          }

          const processed = i + 1;
          if (processed === totalRows || processed % progressStep === 0) {
            pushProgress(processed);
          }
        }

        controller.enqueue(eventLine({ type: "result", result: summary }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(
          eventLine({ type: "error", error: "Import stopped under gemning af leads", details: msg }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
