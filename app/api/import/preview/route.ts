import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getUploadedBlob, uploadFilename } from "@/lib/form-upload";
import { parseImportFile, previewImportFile } from "@/lib/import-parse";
import { applyColumnMapping, pickBaseFromNorm, suggestColumnMapping, type MappingRecord } from "@/lib/import-mapping";
import { buildNormRow } from "@/lib/import-parse-helpers";
import { normalizeCVR } from "@/lib/cvr-import";

const PROTECTED_STATUSES = new Set(["CALLBACK_SCHEDULED", "MEETING_BOOKED", "UNQUALIFIED", "NOT_INTERESTED"]);

export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const form = await req.formData();
  const entry = form.get("file");
  const campaignIdRaw = form.get("campaignId");
  const campaignId = typeof campaignIdRaw === "string" ? campaignIdRaw.trim() : "";
  const mappingRaw = form.get("mapping");
  const overwriteExistingCvrs = form.get("overwriteExistingCvrs") === "1";
  const blob = getUploadedBlob(entry);
  if (!blob) {
    return NextResponse.json({ error: "Upload en fil" }, { status: 400 });
  }
  const uploadName = uploadFilename(blob);

  const parsed = await previewImportFile(blob, uploadName);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, details: parsed.details }, { status: 400 });
  }

  const suggestedMapping = suggestColumnMapping(parsed.columns);
  let mapping: MappingRecord = suggestedMapping;
  if (typeof mappingRaw === "string" && mappingRaw.trim()) {
    try {
      mapping = JSON.parse(mappingRaw) as MappingRecord;
    } catch {
      return NextResponse.json({ error: "Ugyldig mapping JSON" }, { status: 400 });
    }
  }

  let overwritePreview = null as null | {
    cvrMatches: number;
    protectedCvrs: number;
    leadsToDelete: number;
    newLeadsToImport: number;
  };
  if (campaignId && overwriteExistingCvrs) {
    const parsedFull = await parseImportFile(blob, uploadName);
    if (!parsedFull.ok) {
      return NextResponse.json({ error: parsedFull.error, details: parsedFull.details }, { status: 400 });
    }
    const existing = await prisma.lead.findMany({
      where: { campaignId },
      select: { cvr: true, status: true, notes: true },
    });
    const existingByCvr = new Map<string, { status: string; notes: string }[]>();
    for (const lead of existing) {
      const norm = normalizeCVR(lead.cvr);
      if (!norm) continue;
      const arr = existingByCvr.get(norm) ?? [];
      arr.push({ status: lead.status, notes: lead.notes ?? "" });
      existingByCvr.set(norm, arr);
    }
    const seenUploadCvrs = new Set<string>();
    let cvrMatches = 0;
    let protectedCvrs = 0;
    let leadsToDelete = 0;
    let newLeadsToImport = 0;
    for (const row of parsedFull.rows) {
      const n = mapping && Object.keys(mapping).length > 0 ? applyColumnMapping(row, mapping) : buildNormRow(row);
      const base = pickBaseFromNorm(n);
      const cvrNorm = normalizeCVR(base.cvr);
      if (!cvrNorm || seenUploadCvrs.has(cvrNorm)) continue;
      seenUploadCvrs.add(cvrNorm);
      const matches = existingByCvr.get(cvrNorm) ?? [];
      if (matches.length === 0) continue;
      cvrMatches += 1;
      const isProtected = matches.some((lead) => PROTECTED_STATUSES.has(lead.status) || Boolean(lead.notes.trim()));
      if (isProtected) {
        protectedCvrs += 1;
      } else {
        leadsToDelete += matches.length;
        newLeadsToImport += 1;
      }
    }
    overwritePreview = { cvrMatches, protectedCvrs, leadsToDelete, newLeadsToImport };
  }

  return NextResponse.json({
    columns: parsed.columns,
    previewRows: parsed.previewRows,
    suggestedMapping,
    overwritePreview,
  });
}
