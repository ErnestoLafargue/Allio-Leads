import * as XLSX from "xlsx";
import Papa from "papaparse";

export function generateExportCsv(headers: string[], rows: Record<string, string>[]): Buffer {
  const objects = rows.map((r) => {
    const o: Record<string, string> = {};
    for (const h of headers) {
      o[h] = r[h] ?? "";
    }
    return o;
  });
  const csv = Papa.unparse(objects, { columns: headers, header: true, delimiter: ";" });
  const bom = "\uFEFF";
  return Buffer.from(bom + csv, "utf-8");
}

export function generateExportXlsx(headers: string[], rows: Record<string, string>[]): Buffer {
  const aoa: string[][] = [headers];
  for (const r of rows) {
    aoa.push(headers.map((h) => r[h] ?? ""));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function contentDispositionAttachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function stampFilenameBase(prefix: string): string {
  const safe = prefix
    .replace(/[/\\?%*:|"<>]/g, "-")
    .trim()
    .slice(0, 80);
  const stamp = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(new Date())
    .replace(/\//g, "-");
  return `${safe || "export"}_${stamp}`;
}
