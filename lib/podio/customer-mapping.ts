/**
 * Map Allio-lead -> Podio "Kunder"/"Møder"/"Processer" og orkestrér oprettelse.
 *
 * Felter slås op via deres etiket (label) — se docs/PODIO-SETUP.md. Idempotens
 * sikres med Podios item.external_id:
 *   - Kunde:   external_id = Allio Lead ID
 *   - Møde:    external_id = "<leadId>-onboarding"
 *   - Proces:  external_id = "<leadId>-proc-<key>" (stadie-drevet lazy oprettelse)
 *
 * Leveringsmodel: kunden kobles til "Genaktivering"-modellen (Leveringsmodeller-
 * appen, item med external_id "genaktivering"), som definerer de 10 stadier.
 *
 * Alle eksporterede helpers er ikke-fatale: de fanger fejl internt og logger,
 * så en booking aldrig fejler pga. Podio. Hver del er gated på, om den
 * relevante app er konfigureret (PODIO_*_APP_ID), så delvis opsætning er ok.
 */

import { prisma } from "@/lib/prisma";
import { formatPodioDateTimeUtc } from "@/lib/podio/datetime";
import {
  createItem,
  deleteItemByExternalId,
  findItemIdByExternalId,
  getItem,
  isPodioAppConfigured,
  isPodioConfigured,
  readAppRelationItemIds,
  resolveCategoryOptionId,
  resolveFieldExternalId,
  setPodioFieldValue,
  setPodioLocationValue,
  updateItemValues,
  type PodioAppKey,
  type PodioFieldValues,
  type PodioItem,
} from "@/lib/podio/client";

// --- Felt-etiketter (skal matche Podio nøjagtigt, jf. docs/PODIO-SETUP.md) ---

const KUNDE = {
  virksomhed: "Virksomhed",
  kontaktperson: "Kontaktperson",
  telefon: "Telefon",
  email: "Email",
  cvr: "CVR",
  adresse: "Adresse",
  kontonummer: "Kontonummer",
  registreringsnummer: "Registreringsnummer",
  booketAf: "Booket af",
  moedelink: "Første mødelink",
  allioLeadId: "Allio Lead ID",
  calUid: "Cal booking uid",
  stadie: "Stadie",
  leveringsmodel: "Leveringsmodel",
} as const;

/** Genaktiverings-pipeline i Podio (rækkefølge bruges til rollback af processer). */
export const STADIE_ORDER = [
  "Møde booket",
  "Gecko åbnet",
  "Møde afholdt",
  "Kick-off prep",
  "SMS Levering",
  "Kick-off afholdt",
  "Kampagne kørt",
  "Loom Levering",
  "Opsalg & Binding",
  "Løbende aftale", // TODO: procesmodel udskydes — se docs/PODIO-SETUP.md
  "Tabt/Annulleret",
] as const;

export type KundeStadie = (typeof STADIE_ORDER)[number];

export const KUNDE_STADIE = {
  moedeBooket: "Møde booket",
  kickoffPrep: "Kick-off prep",
  kampagneKoert: "Kampagne kørt",
  tabt: "Tabt/Annulleret",
} as const satisfies Record<string, KundeStadie>;

/** External_id på Genaktiverings-modellen i Leveringsmodeller-appen. */
const GENAKTIVERING_EXTERNAL_ID = "genaktivering";

const MOEDE = {
  kunde: "Kunde",
  type: "Type",
  dato: "Dato & tid",
  kickoffDato: "Kick-off dato",
  fathomNoter: "Fathom-noter",
  moedelink: "Mødelink",
  status: "Status",
  ansvarlig: "Ansvarlig",
} as const;

export { MOEDE };

const MOEDE_TYPE = {
  onboarding: "Onboarding",
  kickOff: "Kick-off",
} as const;

export { MOEDE_TYPE };

export const MOEDE_STATUS = {
  booket: "Booket",
  afholdt: "Afholdt",
  aflyst: "Aflyst",
  genbook: "Genbook",
} as const;

export type MoedeStatus = (typeof MOEDE_STATUS)[keyof typeof MOEDE_STATUS];

const PROCES = {
  proces: "Proces",
  kunde: "Kunde",
  ansvarlig: "Ansvarlig",
  status: "Status",
  noter: "Noter",
} as const;

const PROCES_STATUS = {
  ikkeStartet: "Ikke startet",
  iGang: "I gang",
} as const;

/** Opfølgningsproces ved kick-off aflyst/genbook (ikke stadie-drevet). */
export const PROCES_OPFOELGNING = {
  key: "kickoff-opfoelgning",
  navn: "Kick-off opfølgning",
} as const;

export const PROCES_KICKOFF_PREP_KEY = "kickoff-prep";

/** Stadie-drevne processer — oprettes lazy ved booking/webhooks (ikke alle 6 på én gang). */
const PROCES_DEFINITIONS: ReadonlyArray<{
  key: string;
  navn: string;
  minimumStadie: KundeStadie;
}> = [
  { key: "gecko", navn: "Gecko åbnet", minimumStadie: "Møde booket" },
  { key: "kickoff-prep", navn: "Kick-off prep", minimumStadie: "Kick-off prep" },
  { key: "sms-flow", navn: "SMS-kampagneflow", minimumStadie: "Kick-off prep" },
  { key: "sms-levering", navn: "SMS-levering", minimumStadie: "Kick-off prep" },
  { key: "loom", navn: "Loom Levering", minimumStadie: "Kampagne kørt" },
  { key: "opsalg", navn: "Opsalg & Binding", minimumStadie: "Opsalg & Binding" },
];

/** Ældre proces-nøgler (merged til kickoff-prep) — slettes ved sync/rollback. */
const LEGACY_PROCES_KEYS = ["onboarding-noter", "kickoff-pdf"] as const;

// --- Hjælpere --------------------------------------------------------------

function stadieIndex(stadie: string): number {
  return STADIE_ORDER.indexOf(stadie as KundeStadie);
}

function onboardingExternalId(leadId: string): string {
  return `${leadId}-onboarding`;
}

export function kickoffExternalId(leadId: string): string {
  return `${leadId}-kickoff`;
}

function procesExternalId(leadId: string, key: string): string {
  return `${leadId}-proc-${key}`;
}

function logPodioError(context: string, err: unknown): void {
  console.error(`[podio] ${context} fejlede (ikke-fatal):`, err instanceof Error ? err.message : err);
}

type DateFieldValue = { start: string };

async function setField(
  app: PodioAppKey,
  fields: PodioFieldValues,
  label: string,
  value: string | null | undefined,
): Promise<void> {
  await setPodioFieldValue(app, fields, label, value);
}

async function setCategory(
  app: PodioAppKey,
  fields: PodioFieldValues,
  fieldLabel: string,
  optionLabel: string,
): Promise<void> {
  fields[await resolveFieldExternalId(app, fieldLabel)] = await resolveCategoryOptionId(
    app,
    fieldLabel,
    optionLabel,
  );
}

async function setDate(
  app: PodioAppKey,
  fields: PodioFieldValues,
  label: string,
  date: Date,
): Promise<void> {
  const value: DateFieldValue = { start: formatPodioDateTimeUtc(date) };
  fields[await resolveFieldExternalId(app, label)] = value;
}

function leadIdFromMoedeExternalId(externalId: string | null | undefined): string | null {
  const ext = (externalId ?? "").trim();
  const suffix = "-onboarding";
  if (!ext.endsWith(suffix)) return null;
  const leadId = ext.slice(0, -suffix.length);
  return leadId || null;
}

/** Udled Allio leadId fra et Møde-item (external_id eller Kunde-relation). */
export async function resolveLeadIdFromMoedeItem(item: PodioItem): Promise<string | null> {
  const fromExt = leadIdFromMoedeExternalId(item.external_id);
  if (fromExt) return fromExt;
  if (!isPodioAppConfigured("kunder")) return null;
  const kundeIds = readAppRelationItemIds(item, MOEDE.kunde);
  if (kundeIds.length === 0) return null;
  try {
    const kunde = await getItem("kunder", kundeIds[0]);
    const ext = (kunde?.external_id ?? "").trim();
    return ext || null;
  } catch {
    return null;
  }
}

async function ensureSingleProcess(
  leadId: string,
  kundeItemId: number,
  key: string,
  navn: string,
): Promise<void> {
  const ext = procesExternalId(leadId, key);
  const existing = await findItemIdByExternalId("processer", ext);
  if (existing) return;
  const fields: PodioFieldValues = {};
  await setField("processer", fields, PROCES.proces, navn);
  fields[await resolveFieldExternalId("processer", PROCES.kunde)] = [kundeItemId];
  await setCategory("processer", fields, PROCES.status, PROCES_STATUS.ikkeStartet);
  await createItem("processer", { externalId: ext, fields });
}

async function deleteProcessByKey(leadId: string, key: string): Promise<void> {
  try {
    await deleteItemByExternalId("processer", procesExternalId(leadId, key));
  } catch (err) {
    logPodioError(`slet proces "${key}"`, err);
  }
}

/**
 * Idempotent opret/slet processer for et givet kunde-stadie (inkl. rollback).
 * Ikke-fatal.
 */
export async function syncProcessesForStadie(leadId: string, stadie: string): Promise<void> {
  if (!isPodioAppConfigured("processer")) return;

  try {
    const kundeItemId = await findItemIdByExternalId("kunder", leadId);
    if (!kundeItemId) return;

    const currentIndex = stadieIndex(stadie);
    if (currentIndex < 0) {
      console.warn(`[podio] ukendt stadie "${stadie}" for lead ${leadId} — springer proces-sync over`);
      return;
    }

    if (stadie === KUNDE_STADIE.tabt) {
      for (const proc of PROCES_DEFINITIONS) {
        await deleteProcessByKey(leadId, proc.key);
      }
      for (const key of LEGACY_PROCES_KEYS) {
        await deleteProcessByKey(leadId, key);
      }
      return;
    }

    for (const proc of PROCES_DEFINITIONS) {
      const minIndex = stadieIndex(proc.minimumStadie);
      if (minIndex <= currentIndex) {
        try {
          await ensureSingleProcess(leadId, kundeItemId, proc.key, proc.navn);
        } catch (err) {
          logPodioError(`opret proces "${proc.navn}"`, err);
        }
      } else {
        await deleteProcessByKey(leadId, proc.key);
      }
    }
    for (const key of LEGACY_PROCES_KEYS) {
      await deleteProcessByKey(leadId, key);
    }
  } catch (err) {
    logPodioError("syncProcessesForStadie", err);
  }
}

/** Opdater Noter på en eksisterende proces (via external_id-nøgle). */
export async function updateProcesNoter(
  leadId: string,
  procesKey: string,
  noter: string,
): Promise<void> {
  if (!isPodioAppConfigured("processer")) return;
  try {
    const itemId = await findItemIdByExternalId("processer", procesExternalId(leadId, procesKey));
    if (!itemId) return;
    const fields: PodioFieldValues = {};
    await setField("processer", fields, PROCES.noter, noter);
    await updateItemValues("processer", itemId, fields);
  } catch (err) {
    logPodioError(`updateProcesNoter ${procesKey}`, err);
  }
}

/** Opret eller opdatér opfølgningsproces (kick-off aflyst/genbook). */
export async function ensureOpfoelgningsProces(leadId: string, noter: string): Promise<void> {
  if (!isPodioAppConfigured("processer")) return;
  try {
    const kundeItemId = await findItemIdByExternalId("kunder", leadId);
    if (!kundeItemId) return;

    const ext = procesExternalId(leadId, PROCES_OPFOELGNING.key);
    const existing = await findItemIdByExternalId("processer", ext);
    const fields: PodioFieldValues = {};
    await setField("processer", fields, PROCES.proces, PROCES_OPFOELGNING.navn);
    fields[await resolveFieldExternalId("processer", PROCES.kunde)] = [kundeItemId];
    await setCategory("processer", fields, PROCES.status, PROCES_STATUS.iGang);
    await setField("processer", fields, PROCES.noter, noter);

    if (existing) {
      await updateItemValues("processer", existing, fields);
    } else {
      await createItem("processer", { externalId: ext, fields });
    }
  } catch (err) {
    logPodioError("ensureOpfoelgningsProces", err);
  }
}

/** Opdater Kunde-stadie i Podio og synk processer derefter. Ikke-fatal. */
export async function advanceKundeStadie(leadId: string, newStadie: KundeStadie): Promise<void> {
  if (!isPodioAppConfigured("kunder")) return;

  try {
    const kundeItemId = await findItemIdByExternalId("kunder", leadId);
    if (!kundeItemId) return;

    const fields: PodioFieldValues = {};
    await setCategory("kunder", fields, KUNDE.stadie, newStadie);
    await updateItemValues("kunder", kundeItemId, fields);
    await syncProcessesForStadie(leadId, newStadie);
  } catch (err) {
    logPodioError(`advanceKundeStadie → ${newStadie}`, err);
  }
}

// --- Orkestrering: opret/opdatér kunde + onboarding-møde + processer ---------

type LeadForPodio = {
  id: string;
  companyName: string;
  meetingCompanyName: string;
  cvr: string;
  address: string;
  postalCode: string;
  city: string;
  meetingContactName: string;
  meetingContactEmail: string;
  meetingContactPhonePrivate: string;
  meetingScheduledFor: Date | null;
  calComBookingUid: string | null;
  calComMeetingUrl: string | null;
  podioItemId: string | null;
  bookedByUser: { name: string | null } | null;
};

async function buildKundeFields(lead: LeadForPodio, includeStage: boolean): Promise<PodioFieldValues> {
  const fields: PodioFieldValues = {};
  await setField("kunder", fields, KUNDE.virksomhed, lead.meetingCompanyName || lead.companyName);
  await setField("kunder", fields, KUNDE.kontaktperson, lead.meetingContactName);
  await setField("kunder", fields, KUNDE.telefon, lead.meetingContactPhonePrivate);
  await setField("kunder", fields, KUNDE.email, lead.meetingContactEmail);
  await setField("kunder", fields, KUNDE.cvr, lead.cvr);
  await setPodioLocationValue("kunder", fields, KUNDE.adresse, {
    street: lead.address,
    postalCode: lead.postalCode,
    city: lead.city,
  });
  await setField("kunder", fields, KUNDE.booketAf, lead.bookedByUser?.name ?? "");
  await setField("kunder", fields, KUNDE.moedelink, lead.calComMeetingUrl);
  await setField("kunder", fields, KUNDE.allioLeadId, lead.id);
  await setField("kunder", fields, KUNDE.calUid, lead.calComBookingUid);
  if (includeStage) {
    await setCategory("kunder", fields, KUNDE.stadie, KUNDE_STADIE.moedeBooket);
    // Kobl til Genaktiverings-modellen, hvis Leveringsmodeller-appen er sat op.
    if (isPodioAppConfigured("levering")) {
      try {
        const modelItemId = await findItemIdByExternalId("levering", GENAKTIVERING_EXTERNAL_ID);
        if (modelItemId) {
          fields[await resolveFieldExternalId("kunder", KUNDE.leveringsmodel)] = [modelItemId];
        }
      } catch (err) {
        logPodioError("kobl leveringsmodel", err);
      }
    }
  }
  return fields;
}

async function buildMoedeFields(lead: LeadForPodio, kundeItemId: number): Promise<PodioFieldValues> {
  const fields: PodioFieldValues = {};
  fields[await resolveFieldExternalId("moeder", MOEDE.kunde)] = [kundeItemId];
  await setCategory("moeder", fields, MOEDE.type, MOEDE_TYPE.onboarding);
  await setCategory("moeder", fields, MOEDE.status, MOEDE_STATUS.booket);
  await setField("moeder", fields, MOEDE.moedelink, lead.calComMeetingUrl);
  // Ansvarlig udfyldes manuelt i Podio (tekst — ingen Podio-licens pr. sælger).
  if (lead.meetingScheduledFor) {
    await setDate("moeder", fields, MOEDE.dato, lead.meetingScheduledFor);
  }
  return fields;
}

/** Opretter onboarding-mødet i Møder-appen (idempotent). Gated på app-config. */
async function ensureOnboardingMeeting(lead: LeadForPodio, kundeItemId: number): Promise<void> {
  if (!isPodioAppConfigured("moeder")) return;
  try {
    const moedeExt = onboardingExternalId(lead.id);
    const existing = await findItemIdByExternalId("moeder", moedeExt);
    const fields = await buildMoedeFields(lead, kundeItemId);
    if (existing) {
      await updateItemValues("moeder", existing, fields);
    } else {
      await createItem("moeder", { externalId: moedeExt, fields });
    }
  } catch (err) {
    logPodioError("opret/opdater onboarding-møde", err);
  }
}

/**
 * Opretter (eller opdaterer) kunden + onboarding-møde + processer i Podio.
 * Idempotent via external_id. Gemmer podioItemId på leadet. Ikke-fatal.
 */
export async function ensureCustomerInPodio(leadId: string): Promise<void> {
  if (!isPodioConfigured()) return;

  try {
    const lead = (await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        companyName: true,
        meetingCompanyName: true,
        cvr: true,
        address: true,
        postalCode: true,
        city: true,
        meetingContactName: true,
        meetingContactEmail: true,
        meetingContactPhonePrivate: true,
        meetingScheduledFor: true,
        calComBookingUid: true,
        calComMeetingUrl: true,
        podioItemId: true,
        bookedByUser: { select: { name: true } },
      },
    })) as LeadForPodio | null;
    if (!lead) return;

    // --- Kunde (rygrad) ---
    const existingKundeId = await findItemIdByExternalId("kunder", lead.id);
    let kundeItemId: number;
    if (existingKundeId) {
      // Overskriv ikke stadie/leveringsmodel ved opdatering (bevarer manuel fremgang).
      const fields = await buildKundeFields(lead, false);
      await updateItemValues("kunder", existingKundeId, fields);
      kundeItemId = existingKundeId;
    } else {
      const fields = await buildKundeFields(lead, true);
      kundeItemId = await createItem("kunder", { externalId: lead.id, fields });
    }

    if (lead.podioItemId !== String(kundeItemId)) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { podioItemId: String(kundeItemId) },
      });
    }

    await ensureOnboardingMeeting(lead, kundeItemId);
    await syncProcessesForStadie(lead.id, KUNDE_STADIE.moedeBooket);
  } catch (err) {
    logPodioError("ensureCustomerInPodio", err);
  }
}

/**
 * Opdaterer onboarding-mødets status (og evt. dato/link) i Podio efter en
 * Cal.eu-hændelse (aflys/ombook/udeblivelse). Ikke-fatal.
 */
export async function updatePodioMeetingStatus(
  leadId: string,
  opts: { status: MoedeStatus; newStart?: Date; meetingUrl?: string | null },
): Promise<void> {
  if (!isPodioAppConfigured("moeder")) return;

  try {
    const moedeExt = onboardingExternalId(leadId);
    const itemId = await findItemIdByExternalId("moeder", moedeExt);
    if (!itemId) return;

    const fields: PodioFieldValues = {};
    await setCategory("moeder", fields, MOEDE.status, opts.status);
    if (opts.newStart) {
      await setDate("moeder", fields, MOEDE.dato, opts.newStart);
    }
    if (opts.meetingUrl) {
      await setField("moeder", fields, MOEDE.moedelink, opts.meetingUrl);
    }
    await updateItemValues("moeder", itemId, fields);
  } catch (err) {
    logPodioError("updatePodioMeetingStatus", err);
  }
}
