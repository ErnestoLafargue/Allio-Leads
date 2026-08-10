import { prisma } from "@/lib/prisma";
import { formatPodioDateTimeUtc } from "@/lib/podio/datetime";
import {
  createItem,
  deleteItem,
  findItemIdByExternalId,
  isPodioAppConfigured,
  isPodioConfigured,
  readTextValue,
  resolveCategoryOptionId,
  resolveFieldExternalId,
  setPodioFieldValue,
  updateItemValues,
  type PodioFieldValues,
  type PodioItem,
} from "@/lib/podio/client";

/** Feltlabels i den nye Møder-app (Salg-workspace). */
export const MOEDE_FIELDS = {
  virksomhed: "Virksomhed",
  fornavn: "Fornavn",
  efternavn: "Efternavn",
  saelger: "Sælger",
  booketAf: "Boket af",
  status: "Status",
  telefon: "Telefon",
  email: "Email",
  dato: "Dato for møde",
  moedeLink: "Møde link",
  moedeNoter: "Møde noter",
  produkter: "Produkter",
  leadId: "Lead-Id",
  itemId: "Item-id",
} as const;

/** Status-kategorier i Møder-appen. */
export const MOEDE_STATUS = {
  afventer: "Afventer afholdelse",
  genbook: "Møde aflyst - Genbook",
  tabt: "Møde Tabt",
  underBehandling: "Under Behandling",
  vundet: "Møde vundet",
} as const;

export type MoedeStatus = (typeof MOEDE_STATUS)[keyof typeof MOEDE_STATUS];

const DEFAULT_PRODUKT = "Genaktivering";

type LeadMeetingSnapshot = {
  id: string;
  podioItemId: string | null;
  meetingCompanyName: string;
  meetingContactName: string;
  meetingContactEmail: string;
  meetingContactPhonePrivate: string;
  meetingScheduledFor: Date | null;
  calComMeetingUrl: string | null;
  notes: string | null;
  bookedByUser: { name: string | null } | null;
};

function logPodioError(context: string, err: unknown): void {
  console.error(`[podio] ${context} fejlede (ikke-fatal):`, err instanceof Error ? err.message : err);
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function splitContactName(fullName: string): { fornavn: string; efternavn: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { fornavn: parts[0] ?? "", efternavn: "" };
  return { fornavn: parts[0], efternavn: parts.slice(1).join(" ") };
}

async function setCategory(
  fields: PodioFieldValues,
  fieldLabel: string,
  optionLabel: string,
): Promise<void> {
  fields[await resolveFieldExternalId("moeder", fieldLabel)] = await resolveCategoryOptionId(
    "moeder",
    fieldLabel,
    optionLabel,
  );
}

async function setDate(fields: PodioFieldValues, label: string, date: Date): Promise<void> {
  fields[await resolveFieldExternalId("moeder", label)] = {
    start: formatPodioDateTimeUtc(date),
  };
}

async function buildMoedeFields(
  lead: LeadMeetingSnapshot,
  opts?: { status?: MoedeStatus; meetingUrl?: string | null; itemId?: number },
): Promise<PodioFieldValues> {
  const fields: PodioFieldValues = {};
  const { fornavn, efternavn } = splitContactName(lead.meetingContactName);

  await setPodioFieldValue("moeder", fields, MOEDE_FIELDS.virksomhed, lead.meetingCompanyName);
  await setPodioFieldValue("moeder", fields, MOEDE_FIELDS.fornavn, fornavn);
  await setPodioFieldValue("moeder", fields, MOEDE_FIELDS.efternavn, efternavn);
  await setPodioFieldValue("moeder", fields, MOEDE_FIELDS.telefon, lead.meetingContactPhonePrivate);
  await setPodioFieldValue("moeder", fields, MOEDE_FIELDS.email, lead.meetingContactEmail);
  await setPodioFieldValue("moeder", fields, MOEDE_FIELDS.leadId, lead.id);
  await setPodioFieldValue(
    "moeder",
    fields,
    MOEDE_FIELDS.booketAf,
    lead.bookedByUser?.name?.trim() || undefined,
  );

  if (lead.meetingScheduledFor) {
    await setDate(fields, MOEDE_FIELDS.dato, lead.meetingScheduledFor);
  }

  // Interne lead-noter må kun ligge i Podio ("Møde noter") — aldrig i Cal.eu,
  // hvor kunden kan se dem. Feltet er valgfrit i appen, så fejl er ikke-fatale.
  if (lead.notes?.trim()) {
    try {
      await setPodioFieldValue("moeder", fields, MOEDE_FIELDS.moedeNoter, lead.notes.trim());
    } catch {
      /* "Møde noter"-feltet mangler i appen — spring over */
    }
  }

  // Status kun når eksplicit angivet — undgå at overskrive Podio-udfald ved sync-updates.
  if (opts?.status) {
    await setCategory(fields, MOEDE_FIELDS.status, opts.status);
  }

  try {
    await setCategory(fields, MOEDE_FIELDS.produkter, DEFAULT_PRODUKT);
  } catch {
    /* Produkter er valgfrit */
  }

  if (opts?.meetingUrl) {
    await setPodioFieldValue("moeder", fields, MOEDE_FIELDS.moedeLink, opts.meetingUrl);
  }

  if (opts?.itemId) {
    await setPodioFieldValue("moeder", fields, MOEDE_FIELDS.itemId, String(opts.itemId));
  }

  return fields;
}

async function resolveMoedeItemId(leadId: string, cachedPodioItemId: string | null): Promise<number | null> {
  if (cachedPodioItemId) {
    const n = Number(cachedPodioItemId);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const fromExt = await findItemIdByExternalId("moeder", leadId);
  if (fromExt) return fromExt;

  return null;
}

async function loadLeadMeetingSnapshot(leadId: string): Promise<LeadMeetingSnapshot | null> {
  return prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      podioItemId: true,
      meetingCompanyName: true,
      meetingContactName: true,
      meetingContactEmail: true,
      meetingContactPhonePrivate: true,
      meetingScheduledFor: true,
      calComMeetingUrl: true,
      notes: true,
      bookedByUser: { select: { name: true } },
    },
  });
}

/**
 * Opret/opdater Møder-item i Podio (uden Cal-link — det patches bagefter).
 * Idempotent via external_id = lead.id. Ikke-fatal.
 */
export async function ensureMoedeInPodio(leadId: string): Promise<void> {
  if (!isPodioConfigured()) return;

  const lead = await loadLeadMeetingSnapshot(leadId);
  if (!lead?.meetingScheduledFor || !lead.meetingContactName.trim() || !lead.meetingContactEmail.trim()) {
    return;
  }

  try {
    let itemId = await resolveMoedeItemId(lead.id, lead.podioItemId);

    if (itemId) {
      const fields = await buildMoedeFields(lead, {
        meetingUrl: lead.calComMeetingUrl,
        itemId,
      });
      await updateItemValues("moeder", itemId, fields);
    } else {
      const fields = await buildMoedeFields(lead, {
        status: MOEDE_STATUS.afventer,
        meetingUrl: lead.calComMeetingUrl,
      });
      try {
        itemId = await createItem("moeder", { externalId: lead.id, fields });
      } catch (createErr) {
        const existing = await findItemIdByExternalId("moeder", lead.id);
        if (!existing) throw createErr;
        itemId = existing;
        // Eksisterende item — opdater uden at nulstille Status.
        const updateFields = await buildMoedeFields(lead, {
          meetingUrl: lead.calComMeetingUrl,
          itemId,
        });
        await updateItemValues("moeder", itemId, updateFields);
      }
    }

    if (itemId) {
      const patch: PodioFieldValues = {};
      await setPodioFieldValue("moeder", patch, MOEDE_FIELDS.itemId, String(itemId));
      await updateItemValues("moeder", itemId, patch);

      await prisma.lead.update({
        where: { id: lead.id },
        data: { podioItemId: String(itemId) },
      });
    }
  } catch (err) {
    logPodioError("ensureMoedeInPodio", err);
  }
}

/** Opdater status, dato og/eller mødelink på eksisterende Møder-item. Ikke-fatal. */
export async function updateMoedeInPodio(
  leadId: string,
  opts: { status?: MoedeStatus; newStart?: Date; meetingUrl?: string | null },
): Promise<void> {
  if (!isPodioAppConfigured("moeder")) return;

  try {
    const lead = await loadLeadMeetingSnapshot(leadId);
    if (!lead) return;

    const itemId = await resolveMoedeItemId(lead.id, lead.podioItemId);
    if (!itemId) return;

    const fields: PodioFieldValues = {};
    if (opts.status) {
      await setCategory(fields, MOEDE_FIELDS.status, opts.status);
    }
    if (opts.newStart) {
      await setDate(fields, MOEDE_FIELDS.dato, opts.newStart);
    }
    if (opts.meetingUrl) {
      await setPodioFieldValue("moeder", fields, MOEDE_FIELDS.moedeLink, opts.meetingUrl);
    }
    if (Object.keys(fields).length === 0) return;

    await updateItemValues("moeder", itemId, fields);
  } catch (err) {
    logPodioError("updateMoedeInPodio", err);
  }
}

/** Slet Møder-item for et lead (bulk-delete). Ikke-fatal. */
export async function deleteMoedeInPodio(leadId: string): Promise<void> {
  if (!isPodioAppConfigured("moeder")) return;

  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { podioItemId: true },
    });
    const itemId = await resolveMoedeItemId(leadId, lead?.podioItemId ?? null);
    if (!itemId) return;

    await deleteItem("moeder", itemId);
  } catch (err) {
    logPodioError("deleteMoedeInPodio", err);
  }
}

/** Udled Allio leadId fra et Møder-item (external_id eller Lead-Id-felt). */
export function resolveLeadIdFromMoedeItem(item: PodioItem): string | null {
  const fromExt = (item.external_id ?? "").trim();
  if (fromExt) return fromExt;
  return readTextValue(item, MOEDE_FIELDS.leadId);
}

/** Map Podio Status-kategori til normaliseret nøgle. */
export function normalizeMoedeStatus(status: string | null | undefined): string {
  const s = norm(status);
  if (s === norm(MOEDE_STATUS.genbook)) return "genbook";
  if (s === norm(MOEDE_STATUS.tabt)) return "tabt";
  if (s === norm(MOEDE_STATUS.underBehandling)) return "underBehandling";
  if (s === norm(MOEDE_STATUS.vundet)) return "vundet";
  if (s === norm(MOEDE_STATUS.afventer)) return "afventer";
  return s;
}
