/**
 * Podio onboarding → Afholdt: opret kick-off-møde, Cal.eu-invitation og proces-noter.
 */

import {
  createItem,
  findItemIdByExternalId,
  isPodioAppConfigured,
  readPodioDateValue,
  readTextValue,
  resolveCategoryOptionId,
  resolveFieldExternalId,
  setPodioFieldValue,
  updateItemValues,
  type PodioFieldValues,
  type PodioItem,
} from "@/lib/podio/client";
import { createPodioKickoffBooking } from "@/lib/calcom/create-podio-kickoff-booking";
import { formatPodioDateTimeUtc } from "@/lib/podio/datetime";
import {
  advanceKundeStadie,
  kickoffExternalId,
  KUNDE_STADIE,
  MOEDE,
  MOEDE_STATUS,
  MOEDE_TYPE,
  PROCES_SMS_KAMPAGNE_LEVERING_KEY,
  resolveLeadIdFromMoedeItem,
  updateProcesNoter,
} from "@/lib/podio/customer-mapping";

export type OnboardingAfholdtResult =
  | { ok: true; action: "kickoff_scheduled" }
  | { ok: false; reason: string };

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

async function setField(
  fields: PodioFieldValues,
  label: string,
  value: string | null | undefined,
): Promise<void> {
  await setPodioFieldValue("moeder", fields, label, value);
}

async function ensureKickoffMeeting(
  leadId: string,
  kundeItemId: number,
  start: Date,
  meetingUrl: string | null,
  calUid: string | null,
): Promise<void> {
  const ext = kickoffExternalId(leadId);
  const existing = await findItemIdByExternalId("moeder", ext);
  const fields: PodioFieldValues = {};
  fields[await resolveFieldExternalId("moeder", MOEDE.kunde)] = [kundeItemId];
  await setCategory(fields, MOEDE.type, MOEDE_TYPE.kickOff);
  await setCategory(fields, MOEDE.status, MOEDE_STATUS.booket);
  fields[await resolveFieldExternalId("moeder", MOEDE.dato)] = {
    start: formatPodioDateTimeUtc(start),
  };
  if (meetingUrl) {
    await setField(fields, MOEDE.moedelink, meetingUrl);
  }
  if (calUid) {
    // Valgfrit teknisk felt hvis I tilføjer det senere; link er det vigtige for kunden.
  }
  if (existing) {
    await updateItemValues("moeder", existing, fields);
  } else {
    await createItem("moeder", { externalId: ext, fields });
  }
}

/**
 * Onboarding-møde sat til Afholdt i Podio (kræver udfyldt Kick-off dato på samme item).
 * Idempotent via external_id på kick-off-møde.
 */
export async function handleOnboardingAfholdt(item: PodioItem): Promise<OnboardingAfholdtResult> {
  const leadId = await resolveLeadIdFromMoedeItem(item);
  if (!leadId) {
    return { ok: false, reason: "no_lead" };
  }

  const kickoffStart = readPodioDateValue(item, MOEDE.kickoffDato);
  if (!kickoffStart) {
    console.log(
      `[podio] onboarding afholdt for lead ${leadId} uden Kick-off dato — ingen handling`,
    );
    return { ok: false, reason: "missing_kickoff_dato" };
  }

  if (!isPodioAppConfigured("moeder") || !isPodioAppConfigured("kunder")) {
    return { ok: false, reason: "podio_not_configured" };
  }

  const kundeItemId = await findItemIdByExternalId("kunder", leadId);
  if (!kundeItemId) {
    return { ok: false, reason: "no_kunde" };
  }

  const fathomNoter = readTextValue(item, MOEDE.fathomNoter) ?? "";

  await advanceKundeStadie(leadId, KUNDE_STADIE.kickoffPrep);

  if (fathomNoter) {
    await updateProcesNoter(leadId, PROCES_SMS_KAMPAGNE_LEVERING_KEY, fathomNoter);
  }

  const existingKickoff = await findItemIdByExternalId("moeder", kickoffExternalId(leadId));
  let meetingUrl: string | null = null;
  let calUid: string | null = null;

  if (!existingKickoff) {
    const booking = await createPodioKickoffBooking({
      leadId,
      start: kickoffStart,
      notes: fathomNoter ? `SMS-kampagne levering\n\n${fathomNoter.slice(0, 500)}` : undefined,
    });
    meetingUrl = booking?.meetingUrl ?? null;
    calUid = booking?.uid ?? null;
  }

  await ensureKickoffMeeting(leadId, kundeItemId, kickoffStart, meetingUrl, calUid);

  console.log(
    `[podio] onboarding afholdt → kick-off booket for lead ${leadId} @ ${kickoffStart.toISOString()}`,
  );
  return { ok: true, action: "kickoff_scheduled" };
}
