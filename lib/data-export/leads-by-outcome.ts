import type { Lead, Prisma, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_CVR_EXTENSION_FIELDS,
  FIXED_DOMAIN_EXTENSION_FIELD,
  FIXED_PERSON_EXTENSION_FIELDS,
} from "@/lib/campaign-fields";
import { parseCustomFields } from "@/lib/custom-fields";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/lead-status";
import { MEETING_OUTCOME_LABELS } from "@/lib/meeting-outcome";

/** Whitelist for v1 — kun disse tre faste udfald. */
export const EXPORTABLE_OUTCOME_STATUSES = [
  "NOT_INTERESTED",
  "UNQUALIFIED",
  "MEETING_BOOKED",
] as const;

export type ExportableOutcomeStatus = (typeof EXPORTABLE_OUTCOME_STATUSES)[number];

export const EXPORTABLE_OUTCOME_OPTIONS: {
  status: ExportableOutcomeStatus;
  label: string;
}[] = [
  { status: "NOT_INTERESTED", label: LEAD_STATUS_LABELS.NOT_INTERESTED },
  { status: "UNQUALIFIED", label: LEAD_STATUS_LABELS.UNQUALIFIED },
  { status: "MEETING_BOOKED", label: LEAD_STATUS_LABELS.MEETING_BOOKED },
];

const WHITELIST = new Set<string>(EXPORTABLE_OUTCOME_STATUSES);

export function isExportableOutcomeStatus(v: string): v is ExportableOutcomeStatus {
  return WHITELIST.has(v);
}

/**
 * Parse kommaseparerede statusser fra query.
 * Returnerer fejlstreng hvis tomt eller ukendt status.
 */
export function parseExportStatuses(
  raw: string | null,
): { statuses: ExportableOutcomeStatus[] } | { error: string } {
  if (!raw?.trim()) {
    return { error: "Angiv mindst ét udfald (status)." };
  }
  const parts = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (parts.length === 0) {
    return { error: "Angiv mindst ét udfald (status)." };
  }
  const statuses: ExportableOutcomeStatus[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    if (!isExportableOutcomeStatus(p)) {
      return {
        error: `Ugyldigt udfald «${p}». Tilladt: ${EXPORTABLE_OUTCOME_STATUSES.join(", ")}.`,
      };
    }
    if (!seen.has(p)) {
      seen.add(p);
      statuses.push(p);
    }
  }
  return { statuses };
}

export function parseCampaignIds(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

function parseDayBound(raw: string | null, endOfDay: boolean): Date | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const iso = endOfDay ? `${s}T23:59:59.999+02:00` : `${s}T00:00:00.000+02:00`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type OutcomeExportFilters = {
  statuses: ExportableOutcomeStatus[];
  campaignIds?: string[];
  from?: string | null;
  to?: string | null;
};

export function buildOutcomeExportWhere(filters: OutcomeExportFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {
    status: { in: [...filters.statuses] },
  };
  if (filters.campaignIds && filters.campaignIds.length > 0) {
    where.campaignId = { in: filters.campaignIds };
  }
  const from = parseDayBound(filters.from ?? null, false);
  const to = parseDayBound(filters.to ?? null, true);
  if (from || to) {
    where.lastOutcomeAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }
  return where;
}

type UserLabel = Pick<User, "name" | "username">;

export type LeadForOutcomeExport = Lead & {
  campaign: { name: string };
  bookedByUser: UserLabel | null;
  assignedUser: UserLabel | null;
  outcomeLogs: {
    createdAt: Date;
    status: string;
    user: UserLabel | null;
  }[];
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

function userLabel(u: UserLabel | null | undefined): string {
  if (!u) return "";
  return u.name?.trim() || u.username || "";
}

function statusLabel(s: string): string {
  const k = String(s ?? "").trim().toUpperCase() as LeadStatus;
  return LEAD_STATUS_LABELS[k] ?? s;
}

function meetingOutcomeLabel(s: string): string {
  const k = String(s ?? "").trim().toUpperCase();
  return MEETING_OUTCOME_LABELS[k] ?? s;
}

const FIXED_CUSTOM_FIELDS = [
  ...FIXED_PERSON_EXTENSION_FIELDS,
  FIXED_DOMAIN_EXTENSION_FIELD,
  ...DEFAULT_CVR_EXTENSION_FIELDS,
];

/** Faste kolonner — Noter tidligt; Mødeudfald med ved møde-booket leads. */
export const OUTCOME_EXPORT_HEADERS: string[] = [
  "Lead ID",
  "Kampagne",
  "Udfald",
  "CVR",
  "Virksomhedsnavn",
  "Noter",
  "Virksomhed Tlf",
  "Privat Tlf",
  "Email",
  "Adresse",
  "Postnr",
  "By",
  "Branche",
  ...FIXED_CUSTOM_FIELDS.map((f) => f.label),
  "Udfald sat af",
  "Udfaldsdato",
  "Møde booket den",
  "Møde planlagt",
  "Møde booket af",
  "Mødeansvarlig",
  "Mødeudfald",
  "Mødekontakt navn",
  "Mødekontakt email",
  "Mødekontakt telefon (privat)",
];

export function mapLeadToOutcomeExportRow(lead: LeadForOutcomeExport): Record<string, string> {
  const custom = parseCustomFields(lead.customFields);
  const matchingLog =
    lead.outcomeLogs.find((l) => l.status === lead.status && l.user) ??
    lead.outcomeLogs.find((l) => l.status === lead.status) ??
    lead.outcomeLogs[0];

  const row: Record<string, string> = {
    "Lead ID": lead.id,
    Kampagne: lead.campaign?.name ?? "",
    Udfald: statusLabel(lead.status),
    CVR: lead.cvr ?? "",
    Virksomhedsnavn: lead.companyName ?? "",
    Noter: lead.notes ?? "",
    "Virksomhed Tlf": lead.phone ?? "",
    "Privat Tlf": lead.privatePhone ?? "",
    Email: lead.email ?? "",
    Adresse: lead.address ?? "",
    Postnr: lead.postalCode ?? "",
    By: lead.city ?? "",
    Branche: lead.industry ?? "",
    "Udfald sat af": userLabel(matchingLog?.user),
    Udfaldsdato: matchingLog ? fmtDa(matchingLog.createdAt) : fmtDa(lead.lastOutcomeAt),
    "Møde booket den": fmtDa(lead.meetingBookedAt),
    "Møde planlagt": fmtDa(lead.meetingScheduledFor),
    "Møde booket af": userLabel(lead.bookedByUser),
    Mødeansvarlig: userLabel(lead.assignedUser),
    Mødeudfald:
      lead.status === "MEETING_BOOKED"
        ? meetingOutcomeLabel(lead.meetingOutcomeStatus)
        : "",
    "Mødekontakt navn": lead.meetingContactName ?? "",
    "Mødekontakt email": lead.meetingContactEmail ?? "",
    "Mødekontakt telefon (privat)": lead.meetingContactPhonePrivate ?? "",
  };

  for (const f of FIXED_CUSTOM_FIELDS) {
    row[f.label] = custom[f.key] ?? "";
  }

  return row;
}

export function buildOutcomeExportRows(leads: LeadForOutcomeExport[]): {
  headers: string[];
  rows: Record<string, string>[];
} {
  return {
    headers: OUTCOME_EXPORT_HEADERS,
    rows: leads.map(mapLeadToOutcomeExportRow),
  };
}

const leadInclude = {
  campaign: { select: { name: true } },
  bookedByUser: { select: { name: true, username: true } },
  assignedUser: { select: { name: true, username: true } },
  outcomeLogs: {
    orderBy: { createdAt: "desc" as const },
    take: 10,
    select: {
      createdAt: true,
      status: true,
      user: { select: { name: true, username: true } },
    },
  },
} satisfies Prisma.LeadInclude;

export async function countLeadsByOutcome(filters: OutcomeExportFilters): Promise<number> {
  return prisma.lead.count({ where: buildOutcomeExportWhere(filters) });
}

export async function fetchLeadsByOutcome(
  filters: OutcomeExportFilters,
): Promise<LeadForOutcomeExport[]> {
  return prisma.lead.findMany({
    where: buildOutcomeExportWhere(filters),
    orderBy: [{ lastOutcomeAt: "desc" }, { updatedAt: "desc" }],
    include: leadInclude,
  }) as Promise<LeadForOutcomeExport[]>;
}

export function outcomeExportFilenameBase(statuses: ExportableOutcomeStatus[]): string {
  const labels = statuses.map((s) =>
    LEAD_STATUS_LABELS[s].toLowerCase().replace(/\s+/g, "-"),
  );
  return stampSafe(`udfald_${labels.join("_")}`);
}

function stampSafe(prefix: string): string {
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
