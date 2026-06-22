/**
 * Map Allio-lead -> Podio "Kunder"/"Møder"/"Processer" og orkestrér oprettelse.
 *
 * Felter slås op via deres etiket (label) — se docs/PODIO-SETUP.md. Idempotens
 * sikres med Podios item.external_id:
 *   - Kunde:   external_id = Allio Lead ID
 *   - Møde:    external_id = "<leadId>-onboarding"
 *   - Proces:  external_id = "<leadId>-proc-<key>"
 *
 * Leveringsmodel: kunden kobles til "Genaktivering"-modellen (Leveringsmodeller-
 * appen, item med external_id "genaktivering"), som definerer de 10 stadier.
 *
 * Alle eksporterede helpers er ikke-fatale: de fanger fejl internt og logger,
 * så en booking aldrig fejler pga. Podio. Hver del er gated på, om den
 * relevante app er konfigureret (PODIO_*_APP_ID), så delvis opsætning er ok.
 */

import { prisma } from "@/lib/prisma";
import {
  createItem,
  findItemIdByExternalId,
  isPodioAppConfigured,
  isPodioConfigured,
  resolveCategoryOptionId,
  resolveFieldExternalId,
  setPodioFieldValue,
  setPodioLocationValue,
  updateItemValues,
  type PodioAppKey,
  type PodioFieldValues,
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

const KUNDE_STADIE = {
  moedeBooket: "Møde booket",
} as const;

/** External_id på Genaktiverings-modellen i Leveringsmodeller-appen. */
const GENAKTIVERING_EXTERNAL_ID = "genaktivering";

const MOEDE = {
  kunde: "Kunde",
  type: "Type",
  dato: "Dato & tid",
  moedelink: "Mødelink",
  status: "Status",
  ansvarlig: "Ansvarlig",
} as const;

const MOEDE_TYPE = {
  onboarding: "Onboarding",
} as const;

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
} as const;

const PROCES_STATUS = {
  ikkeStartet: "Ikke startet",
} as const;

/**
 * Standard-processer (kanban-leverancer) for Genaktiverings-modellen.
 * Oprettes pr. kunde som "Ikke startet" og tildeles/flyttes manuelt i Podio.
 */
const GENAKTIVERING_PROCESSER: ReadonlyArray<{ key: string; navn: string }> = [
  { key: "gecko", navn: "Gecko åbnet" },
  { key: "onboarding-noter", navn: "Onboarding-noter (Fathom)" },
  { key: "kickoff-pdf", navn: "Kick-off PDF" },
  { key: "sms-flow", navn: "SMS-kampagneflow" },
  { key: "loom", navn: "Loom Levering" },
  { key: "opsalg", navn: "Opsalg & Binding" },
];

// --- Hjælpere --------------------------------------------------------------

/** Formatér Date som Podio-datetime "YYYY-MM-DD HH:mm:ss" i Europe/Copenhagen. */
function formatPodioDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function onboardingExternalId(leadId: string): string {
  return `${leadId}-onboarding`;
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
  const value: DateFieldValue = { start: formatPodioDateTime(date) };
  fields[await resolveFieldExternalId(app, label)] = value;
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
 * Opretter standard-processerne (kanban-leverancer) for kunden. Kun de
 * manglende oprettes — eksisterende processers status/ansvarlig bevares.
 * Gated på Processer-appens config.
 */
async function ensureProcesserForCustomer(lead: LeadForPodio, kundeItemId: number): Promise<void> {
  if (!isPodioAppConfigured("processer")) return;
  try {
    const kundeRelExt = await resolveFieldExternalId("processer", PROCES.kunde);
    for (const proc of GENAKTIVERING_PROCESSER) {
      try {
        const ext = procesExternalId(lead.id, proc.key);
        const existing = await findItemIdByExternalId("processer", ext);
        if (existing) continue;
        const fields: PodioFieldValues = {};
        await setField("processer", fields, PROCES.proces, proc.navn);
        fields[kundeRelExt] = [kundeItemId];
        await setCategory("processer", fields, PROCES.status, PROCES_STATUS.ikkeStartet);
        await createItem("processer", { externalId: ext, fields });
      } catch (err) {
        logPodioError(`opret proces "${proc.navn}"`, err);
      }
    }
  } catch (err) {
    logPodioError("ensureProcesserForCustomer", err);
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
    await ensureProcesserForCustomer(lead, kundeItemId);
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
