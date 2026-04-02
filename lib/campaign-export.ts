import * as XLSX from "xlsx";
import Papa from "papaparse";
import type { Lead, User } from "@prisma/client";
import { FIELD_GROUPS, parseFieldConfig } from "@/lib/campaign-fields";
import { parseCustomFields } from "@/lib/custom-fields";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/lead-status";
import { MEETING_OUTCOME_LABELS } from "@/lib/meeting-outcome";

type LeadWithRelations = Lead & {
  bookedByUser: Pick<User, "name" | "username"> | null;
  callbackReservedByUser: Pick<User, "name" | "username"> | null;
  callbackCreatedByUser: Pick<User, "name" | "username"> | null;
  lockedByUser: Pick<User, "name" | "username"> | null;
  _count: { outcomeLogs: number };
  outcomeLogs: { createdAt: Date; status: string }[];
};

function fmtDa(dt: Date | null | undefined): string {
  if (!dt) return "";
  try {
    return new Intl.DateTimeFormat("da-DK", {
      timeZone: "Europe/Copenhagen",
      dateStyle: "short",
      timeStyle: "short",
    }).format(dt);
  } catch {
    return "";
  }
}

function userLabel(u: Pick<User, "name" | "username"> | null): string {
  if (!u) return "";
  return u.name?.trim() || u.username || "";
}

function statusLabel(s: string): string {
  const k = String(s ?? "").trim().toUpperCase() as LeadStatus;
  return LEAD_STATUS_LABELS[k as LeadStatus] ?? s;
}

function meetingOutcomeLabel(s: string): string {
  const k = String(s ?? "").trim().toUpperCase();
  return MEETING_OUTCOME_LABELS[k] ?? s;
}

/** Unik kolonneoverskrift for tilpassede felter (undgå dubletter). */
function extensionHeader(label: string, key: string, used: Set<string>): string {
  let h = label.trim() || key;
  if (used.has(h)) {
    h = `${label} (${key})`;
  }
  used.add(h);
  return h;
}

export function collectExportHeaders(fieldConfigJson: string): {
  headers: string[];
  extensionMap: { header: string; key: string }[];
} {
  const cfg = parseFieldConfig(fieldConfigJson);
  const used = new Set<string>();
  const extensionMap: { header: string; key: string }[] = [];
  for (const g of FIELD_GROUPS) {
    for (const f of cfg.extensions[g] ?? []) {
      extensionMap.push({
        key: f.key,
        header: extensionHeader(f.label, f.key, used),
      });
    }
  }
  const coreBeforeExt = [
    "Lead ID",
    "Virksomhedsnavn",
    "CVR",
    "Telefon",
    "Email",
    "Adresse",
    "Postnr",
    "By",
    "Branche",
  ];
  const extHeaders = extensionMap.map((e) => e.header);
  const tailHeaders = [
    "Noter",
    "Udfald",
    "Voicemail markeret",
    "Ikke hjemme markeret",
    "Importeret",
    "Senest opdateret",
    "Seneste udfaldsdato",
    "Antal udfaldsregistreringer",
    "Møde booket den",
    "Møde planlagt",
    "Møde booket af",
    "Mødeudfald",
    "Mødekontakt navn",
    "Mødekontakt email",
    "Mødekontakt telefon (privat)",
    "Callback planlagt",
    "Callback status",
    "Callback note",
    "Callback tildelt til",
    "Callback oprettet af",
    "Låst af",
    "Tilpassede felter (JSON)",
  ];
  const headers = [...coreBeforeExt, ...extHeaders, ...tailHeaders];
  return { headers, extensionMap };
}

export function mapLeadToExportRow(
  lead: LeadWithRelations,
  extensionMap: { header: string; key: string }[],
): Record<string, string> {
  const custom = parseCustomFields(lead.customFields);
  const usedKeys = new Set(extensionMap.map((e) => e.key));
  const orphan: Record<string, string> = {};
  for (const [k, v] of Object.entries(custom)) {
    if (!usedKeys.has(k)) orphan[k] = v;
  }
  const orphanJson = Object.keys(orphan).length ? JSON.stringify(orphan) : "";

  const latestLog = lead.outcomeLogs[0];
  const row: Record<string, string> = {
    "Lead ID": lead.id,
    Virksomhedsnavn: lead.companyName,
    CVR: lead.cvr,
    Telefon: lead.phone,
    Email: lead.email,
    Adresse: lead.address,
    Postnr: lead.postalCode,
    By: lead.city,
    Branche: lead.industry,
    Noter: lead.notes,
    Udfald: statusLabel(lead.status),
    "Voicemail markeret": fmtDa(lead.voicemailMarkedAt),
    "Ikke hjemme markeret": fmtDa(lead.notHomeMarkedAt),
    Importeret: fmtDa(lead.importedAt),
    "Senest opdateret": fmtDa(lead.updatedAt),
    "Seneste udfaldsdato": latestLog ? fmtDa(latestLog.createdAt) : "",
    "Antal udfaldsregistreringer": String(lead._count?.outcomeLogs ?? 0),
    "Møde booket den": fmtDa(lead.meetingBookedAt),
    "Møde planlagt": fmtDa(lead.meetingScheduledFor),
    "Møde booket af": userLabel(lead.bookedByUser),
    Mødeudfald: meetingOutcomeLabel(lead.meetingOutcomeStatus),
    "Mødekontakt navn": lead.meetingContactName,
    "Mødekontakt email": lead.meetingContactEmail,
    "Mødekontakt telefon (privat)": lead.meetingContactPhonePrivate,
    "Callback planlagt": fmtDa(lead.callbackScheduledFor),
    "Callback status": lead.callbackStatus,
    "Callback note": lead.callbackNote ?? "",
    "Callback tildelt til": userLabel(lead.callbackReservedByUser),
    "Callback oprettet af": userLabel(lead.callbackCreatedByUser),
    "Låst af": userLabel(lead.lockedByUser),
    "Tilpassede felter (JSON)": orphanJson,
  };

  for (const { header, key } of extensionMap) {
    row[header] = custom[key] ?? "";
  }

  return row;
}

export function buildExportRows(
  leads: LeadWithRelations[],
  fieldConfigJson: string,
): { headers: string[]; rows: Record<string, string>[] } {
  const { headers, extensionMap } = collectExportHeaders(fieldConfigJson);
  const rows = leads.map((l) => mapLeadToExportRow(l, extensionMap));
  return { headers, rows };
}

export function generateCampaignCsv(headers: string[], rows: Record<string, string>[]): Buffer {
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

export function generateCampaignXlsx(headers: string[], rows: Record<string, string>[]): Buffer {
  const aoa: string[][] = [headers];
  for (const r of rows) {
    aoa.push(headers.map((h) => r[h] ?? ""));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function exportFilenameBase(campaignName: string): string {
  const safe = campaignName
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
  return `${safe || "kampagne"}_${stamp}`;
}
