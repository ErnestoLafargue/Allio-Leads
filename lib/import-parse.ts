import Papa from "papaparse";
import * as XLSX from "xlsx";

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v).trim();
  if (typeof v === "bigint") return String(v);
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? v.toISOString() : "";
  }
  try {
    return String(v).trim();
  } catch {
    return "";
  }
}

function rowToStringRecord(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = String(k).trim();
    if (!key) continue;
    out[key] = cellToString(v);
  }
  return out;
}

function nonEmptyRow(r: Record<string, string>) {
  return Object.values(r).some((v) => String(v).trim());
}

/**
 * Læser første ark i Excel eller CSV med overskriftsrække.
 * `filename` bruges til filtype (Blob har ikke altid .name).
 */
export async function parseImportFile(
  file: File | Blob,
  filename: string,
): Promise<{ ok: true; rows: Record<string, string>[] } | { ok: false; error: string; details?: string }> {
  try {
    const lower = filename.toLowerCase();

    if (lower.endsWith(".csv")) {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
      });
      if (parsed.errors.length) {
        return {
          ok: false,
          error: "Kunne ikke læse CSV",
          details: parsed.errors[0]?.message,
        };
      }
      const rows = parsed.data.filter(nonEmptyRow).map((r) => {
        const o: Record<string, string> = {};
        for (const [k, v] of Object.entries(r)) {
          o[k] = v == null ? "" : String(v).trim();
        }
        return o;
      });
      return { ok: true, rows };
    }

    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      if (!wb.SheetNames.length) {
        return { ok: false, error: "Excel-filen indeholder ingen ark" };
      }
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      });
      const rows = rawRows.map(rowToStringRecord).filter(nonEmptyRow);
      return { ok: true, rows };
    }

    return {
      ok: false,
      error: "Filtype understøttes ikke (brug .csv, .xlsx eller .xls)",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: "Kunne ikke læse filen",
      details: msg,
    };
  }
}

export type PreviewResult =
  | { ok: true; columns: string[]; previewRows: Record<string, string>[] }
  | { ok: false; error: string; details?: string };

/**
 * Kolonner + de første rækker til forhåndsvisning og mapping.
 */
export async function previewImportFile(file: File | Blob, filename: string): Promise<PreviewResult> {
  try {
    const lower = filename.toLowerCase();

    if (lower.endsWith(".csv")) {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
      });
      if (parsed.errors.length) {
        return {
          ok: false,
          error: "Kunne ikke læse CSV",
          details: parsed.errors[0]?.message,
        };
      }
      const fields = (parsed.meta.fields ?? []).map((f) => String(f).trim());
      const rows = parsed.data
        .filter(nonEmptyRow)
        .map((r) => {
          const o: Record<string, string> = {};
          for (const [k, v] of Object.entries(r)) {
            o[k] = v == null ? "" : String(v).trim();
          }
          return o;
        });
      const keysFromData = rows.length
        ? Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
        : [];
      const columns = keysFromData.length ? keysFromData : fields.filter(Boolean);
      return { ok: true, columns, previewRows: rows.slice(0, 5) };
    }

    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      if (!wb.SheetNames.length) {
        return { ok: false, error: "Excel-filen indeholder ingen ark" };
      }
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const dataRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      })
        .map(rowToStringRecord)
        .filter(nonEmptyRow);

      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
      const headerCells = (aoa[0] ?? []).map((c) => String(c ?? "").trim());

      let columns: string[] = [];
      if (dataRows.length) {
        const keys = new Set<string>();
        for (const r of dataRows) {
          for (const k of Object.keys(r)) keys.add(k);
        }
        columns = Array.from(keys);
      }
      if (columns.length === 0 && headerCells.length) {
        columns = headerCells.map((h, i) => (h ? h : `Kolonne ${i + 1}`));
      }

      return { ok: true, columns, previewRows: dataRows.slice(0, 5) };
    }

    return { ok: false, error: "Filtype understøttes ikke (brug .csv, .xlsx eller .xls)" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: "Kunne ikke læse filen",
      details: msg,
    };
  }
}
