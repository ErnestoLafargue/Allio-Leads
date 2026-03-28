import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getUploadedBlob, uploadFilename } from "@/lib/form-upload";
import { previewImportFile } from "@/lib/import-parse";
import { suggestColumnMapping } from "@/lib/import-mapping";

export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const form = await req.formData();
  const entry = form.get("file");
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

  return NextResponse.json({
    columns: parsed.columns,
    previewRows: parsed.previewRows,
    suggestedMapping,
  });
}
