import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getUploadedBlob, uploadFilename } from "@/lib/form-upload";
import { parseImportFile } from "@/lib/import-parse";
import { suggestColumnMapping, type MappingRecord } from "@/lib/import-mapping";
import {
  buildEnrichmentPreview,
  type EnrichmentFieldBreakdown,
  prepareEnrichmentUpload,
  restrictMappingForTargetFields,
  type EnrichmentMatchField,
} from "@/lib/campaign-enrichment";

type Params = { params: Promise<{ id: string }> };

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
  const { response } = await requireAdmin();
  if (response) return response;

  const { id: campaignId } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, fieldConfig: true },
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

  return NextResponse.json({
    suggestedMapping: suggestColumnMapping(allColumns),
    columns: allColumns,
    previewRows: parsed.rows.slice(0, 5),
    stats: preview.stats,
    warnings: preview.warnings,
    fieldBreakdown: preview.fieldBreakdown as EnrichmentFieldBreakdown[],
    uploadGroups: preview.uploadGroups,
    matchField,
    overwriteExisting,
    targetFields,
  });
}
