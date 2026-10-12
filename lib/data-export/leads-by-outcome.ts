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

/**
 * Historisk filter: lead har mindst én gang fået ét af de valgte udfald
 * (LeadOutcomeLog) — også hvis nuværende status er noget andet (fx genbook →
 * ikke interesseret). Dato gælder for den historiske udfaldslog.
 * Kampagne: nuværende kampagne ELLER besøgshistorik på kampagnen (leads flyttes
 * ofte til kommende møder / genbooking).
 */
export function buildOutcomeExportWhere(filters: OutcomeExportFilters): Prisma.LeadWhereInput {
  const from = parseDayBound(filters.from ?? null, false);
  const to = parseDayBound(filters.to ?? null, true);

  const outcomeLogSome: Prisma.LeadOutcomeLogWhereInput = {
    status: { in: [...filters.statuses] },
  };
  if (from || to) {
    outcomeLogSome.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  const where: Prisma.LeadWhereInput = {
    outcomeLogs: { some: outcomeLogSome },
  };

  if (filters.campaignIds && filters.campaignIds.length > 0) {
    const ids = filters.campaignIds;
    where.OR = [
      { campaignId: { in: ids } },
      { visitHistory: { some: { campaignId: { in: ids } } } },
    ];
  }

  return where;
}

type UserLabel = Pick<User, "name" | "username">;

export type LeadForOutcomeExport = Lead & {
  campaign: { name: string } | null;
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

/** Faste kolonner — Noter tidligt; historisk udfald + nuværende status. */
export const OUTCOME_EXPORT_HEADERS: string[] = [
  "Lead ID",
  "Kampagne (nuværende)",
  "Historisk udfald",
  "Nuværende udfald",
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
  "Historisk udfald sat af",
  "Historisk udfaldsdato",
  "Møde booket den",
  "Møde planlagt",
  "Møde booket af",
  "Mødeansvarlig",
  "Mødeudfald",
  "Mødekontakt navn",
  "Mødekontakt email",
  "Mødekontakt telefon (privat)",
];

export function mapLeadToOutcomeExportRow(
  lead: LeadForOutcomeExport,
  selectedStatuses: ExportableOutcomeStatus[] = [...EXPORTABLE_OUTCOME_STATUSES],
): Record<string, string> {
  const custom = parseCustomFields(lead.customFields);
  const selectedSet = new Set<string>(selectedStatuses);

  const matchingLogs = lead.outcomeLogs.filter((l) => selectedSet.has(l.status));
  const primaryLog =
    matchingLogs.find((l) => l.user) ?? matchingLogs[0] ?? null;

  const historicalLabels = [
    ...new Set(matchingLogs.map((l) => statusLabel(l.status))),
  ].join(", ");

  const everMeetingBooked =
    selectedSet.has("MEETING_BOOKED") &&
    (lead.outcomeLogs.some((l) => l.status === "MEETING_BOOKED") ||
      Boolean(lead.meetingBookedAt) ||
      lead.status === "MEETING_BOOKED");

  const meetingBookedLog = lead.outcomeLogs.find((l) => l.status === "MEETING_BOOKED");

  const row: Record<string, string> = {
    "Lead ID": lead.id,
    "Kampagne (nuværende)": lead.campaign?.name ?? "",
    "Historisk udfald": historicalLabels || (primaryLog ? statusLabel(primaryLog.status) : ""),
    "Nuværende udfald": statusLabel(lead.status),
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
    "Historisk udfald sat af": userLabel(primaryLog?.user),
    "Historisk udfaldsdato": primaryLog
      ? fmtDa(primaryLog.createdAt)
      : fmtDa(lead.lastOutcomeAt),
    "Møde booket den": fmtDa(lead.meetingBookedAt) || fmtDa(meetingBookedLog?.createdAt),
    "Møde planlagt": fmtDa(lead.meetingScheduledFor),
    "Møde booket af": userLabel(lead.bookedByUser),
    Mødeansvarlig: userLabel(lead.assignedUser),
    Mødeudfald: everMeetingBooked ? meetingOutcomeLabel(lead.meetingOutcomeStatus) : "",
    "Mødekontakt navn": lead.meetingContactName ?? "",
    "Mødekontakt email": lead.meetingContactEmail ?? "",
    "Mødekontakt telefon (privat)": lead.meetingContactPhonePrivate ?? "",
  };

  for (const f of FIXED_CUSTOM_FIELDS) {
    row[f.label] = custom[f.key] ?? "";
  }

  return row;
}

export function buildOutcomeExportRows(
  leads: LeadForOutcomeExport[],
  selectedStatuses: ExportableOutcomeStatus[],
): {
  headers: string[];
  rows: Record<string, string>[];
} {
  return {
    headers: OUTCOME_EXPORT_HEADERS,
    rows: leads.map((l) => mapLeadToOutcomeExportRow(l, selectedStatuses)),
  };
}

function outcomeLogInclude(statuses: ExportableOutcomeStatus[]) {
  return {
    campaign: { select: { name: true } },
    bookedByUser: { select: { name: true, username: true } },
    assignedUser: { select: { name: true, username: true } },
    outcomeLogs: {
      where: { status: { in: [...statuses] } },
      orderBy: { createdAt: "desc" as const },
      take: 20,
      select: {
        createdAt: true,
        status: true,
        user: { select: { name: true, username: true } },
      },
    },
  } satisfies Prisma.LeadInclude;
}

export async function countLeadsByOutcome(filters: OutcomeExportFilters): Promise<number> {
  return prisma.lead.count({ where: buildOutcomeExportWhere(filters) });
}

export async function fetchLeadsByOutcome(
  filters: OutcomeExportFilters,
): Promise<LeadForOutcomeExport[]> {
  return prisma.lead.findMany({
    where: buildOutcomeExportWhere(filters),
    orderBy: [{ updatedAt: "desc" }],
    include: outcomeLogInclude(filters.statuses),
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
