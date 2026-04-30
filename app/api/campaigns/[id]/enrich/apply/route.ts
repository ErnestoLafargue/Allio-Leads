import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getUploadedBlob, uploadFilename } from "@/lib/form-upload";
import { parseImportFile } from "@/lib/import-parse";
import { suggestColumnMapping, type MappingRecord } from "@/lib/import-mapping";
import {
  buildEnrichmentPreview,
  prepareEnrichmentUpload,
  restrictMappingForTargetFields,
  type EnrichmentMatchField,
} from "@/lib/campaign-enrichment";

type Params = { params: Promise<{ id: string }> };
type ApplyResponse = {
  ok: boolean;
  campaignName: string;
  stats: ReturnType<typeof buildEnrichmentPreview>["stats"];
  warnings: string[];
};

const MATCH_FIELDS: EnrichmentMatchField[] = ["cvr", "companyName", "phone", "email", "domain"];

function asMatchField(v: FormDataEntryValue | null): EnrichmentMatchField {
  if (typeof v !== "string") return "cvr";
  return (MATCH_FIELDS as string[]).includes(v) ? (v as EnrichmentMatchField) : "cvr";
}

function hasMatchColumn(mapping: MappingRecord, matchField: EnrichmentMatchField): boolean {
  const values = Object.values(mapping);
  if (matchField === "domain") {
    return values.some((v) => v === "domain" || v === "custom:domain" || v === "custom:website");
  }
  return values.includes(matchField);
}

export async function POST(req: Request, { params }: Params) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const { id: campaignId } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, fieldConfig: true },
  });
  if (!campaign) return NextResponse.json({ error: "Kampagnen findes ikke." }, { status: 404 });

  const form = await req.formData();
  const blob = getUploadedBlob(form.get("file"));
  if (!blob) return NextResponse.json({ error: "Upload en fil." }, { status: 400 });
  const filename = uploadFilename(blob, "berigelse.csv");
  const parsed = await parseImportFile(blob, filename);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, details: parsed.details }, { status: 400 });
  }

  const mappingRaw = form.get("mapping");
  const allColumns = Array.from(new Set(parsed.rows.flatMap((r) => Object.keys(r))));

  let mapping: MappingRecord;
  if (typeof mappingRaw === "string" && mappingRaw.trim()) {
    try {
      mapping = JSON.parse(mappingRaw) as MappingRecord;
    } catch {
      return NextResponse.json({ error: "Ugyldig mapping." }, { status: 400 });
    }
  } else {
    mapping = suggestColumnMapping(allColumns);
  }

  const matchField = asMatchField(form.get("matchField"));
  const overwriteExisting = form.get("overwriteExisting") === "1";
  const targetFieldsRaw = form.get("targetFields");
  const targetFieldLegacyRaw = form.get("targetField");
  let targetFields: string[] = [];
  if (typeof targetFieldsRaw === "string" && targetFieldsRaw.trim()) {
    try {
      const parsed = JSON.parse(targetFieldsRaw) as unknown;
      if (Array.isArray(parsed)) {
        targetFields = parsed.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
      }
    } catch {
      return NextResponse.json({ error: "Ugyldig targetFields." }, { status: 400 });
    }
  } else if (typeof targetFieldLegacyRaw === "string" && targetFieldLegacyRaw.trim()) {
    targetFields = [targetFieldLegacyRaw.trim()];
  }
  if (!hasMatchColumn(mapping, matchField)) {
    return NextResponse.json(
      { error: "Manglende match-kolonne i mapping.", details: `Vælg mindst én kolonne til ${matchField}.` },
      { status: 400 },
    );
  }
  if (targetFields.length > 0) {
    const mappedTargets = new Set(Object.values(mapping));
    const missingTargets = targetFields.filter((field) => !mappedTargets.has(field));
    if (missingTargets.length > 0) {
      return NextResponse.json(
        { error: "Valgt berig-felt findes ikke i mapping.", details: "Vælg et felt der er mappet fra filen." },
        { status: 400 },
      );
    }
    mapping = restrictMappingForTargetFields(mapping, targetFields, matchField);
  }

  const prepared = prepareEnrichmentUpload({
    rows: parsed.rows,
    mapping,
    fieldConfigJson: campaign.fieldConfig,
    matchField,
  });

  const leads = await prisma.lead.findMany({
    where: { campaignId },
    select: {
      id: true,
      companyName: true,
      phone: true,
      email: true,
      cvr: true,
      address: true,
      postalCode: true,
      city: true,
      industry: true,
      notes: true,
      customFields: true,
    },
  });

  const preview = buildEnrichmentPreview({
    prepared,
    leads,
    matchField,
    overwriteExisting,
    focusFields: targetFields,
  });

  const totalLeads = preview.stats.leadsToUpdate;
  const encoder = new TextEncoder();
  const resultPayload: ApplyResponse = {
    ok: true,
    campaignName: campaign.name,
    stats: preview.stats,
    warnings: preview.warnings,
  };

  function eventLine(payload: Record<string, unknown>) {
    return encoder.encode(`${JSON.stringify(payload)}\n`);
  }
  function progressPayload(processedLeads: number) {
    const percent = totalLeads === 0 ? 100 : Math.min(100, Math.round((processedLeads / totalLeads) * 100));
    return {
      type: "progress",
      processedLeads,
      totalLeads,
      percent,
    };
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const progressStep = Math.max(1, Math.floor(totalLeads / 100));
      try {
        controller.enqueue(eventLine(progressPayload(0)));
        for (let i = 0; i < preview.plans.length; i++) {
          const plan = preview.plans[i];
          await prisma.lead.updateMany({
            where: { id: plan.leadId, campaignId },
            data: plan.data,
          });
          const processedLeads = i + 1;
          if (processedLeads === totalLeads || processedLeads % progressStep === 0) {
            controller.enqueue(eventLine(progressPayload(processedLeads)));
          }
        }

        await prisma.campaignEnrichmentLog.create({
          data: {
            campaignId,
            userId: session!.user.id,
            filename,
            matchField,
            overwriteExisting,
            uploadedRows: preview.stats.totalRows,
            matchedRows: preview.stats.matchedUploadGroups,
            updatedLeads: preview.stats.leadsToUpdate,
            fieldsAdded: preview.stats.fieldsAdded,
            fieldsOverwritten: preview.stats.fieldsOverwritten,
            fieldsUnchanged: preview.stats.fieldsUnchanged,
            unmatchedRows: preview.stats.unmatchedUploadGroups,
            duplicateUploadRows: preview.stats.duplicateUploadRows,
          },
        });

        controller.enqueue(eventLine({ type: "result", result: resultPayload }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(eventLine({ type: "error", error: "Berigelse fejlede.", details: msg }));
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
