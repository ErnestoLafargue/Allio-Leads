import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getUploadedBlob, uploadFilename } from "@/lib/form-upload";
import { parseImportFile } from "@/lib/import-parse";
import { suggestColumnMapping, type MappingRecord } from "@/lib/import-mapping";
import {
  buildEnrichmentPreview,
  prepareEnrichmentUpload,
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
  if (!hasMatchColumn(mapping, matchField)) {
    return NextResponse.json(
      { error: "Manglende match-kolonne i mapping.", details: `Vælg mindst én kolonne til ${matchField}.` },
      { status: 400 },
    );
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
  });

  for (const plan of preview.plans) {
    await prisma.lead.updateMany({
      where: { id: plan.leadId, campaignId },
      data: plan.data,
    });
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

  return NextResponse.json({
    ok: true,
    campaignName: campaign.name,
    stats: preview.stats,
    warnings: preview.warnings,
  });
}
