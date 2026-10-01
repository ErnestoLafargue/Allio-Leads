import {
  FIXED_PERSON_EXTENSION_FIELDS,
  isFixedPersonExtensionKey,
  type CampaignExtraField,
  type CampaignFieldConfig,
  resolveFixedPersonFieldKeys,
} from "@/lib/campaign-fields";
import { hasLeadPhone } from "@/lib/lead-phone-filter";
import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";

export const DIAL_PHONE_PRIORITIES = ["PRIVATE_FIRST", "COMPANY_FIRST"] as const;
export type DialPhonePriority = (typeof DIAL_PHONE_PRIORITIES)[number];
export type DialPhoneKind = "COMPANY" | "PRIVATE";

export const DIAL_PHONE_PRIORITY_DEFAULT: DialPhonePriority = "PRIVATE_FIRST";

export const DIAL_PHONE_PRIORITY_LABELS: Record<DialPhonePriority, string> = {
  PRIVATE_FIRST: "Privat Tlf først",
  COMPANY_FIRST: "Virksomhed Tlf først",
};

export function normalizeDialPhonePriority(raw: unknown): DialPhonePriority {
  const s = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (s === "COMPANY_FIRST") return "COMPANY_FIRST";
  return "PRIVATE_FIRST";
}

export type DialPhoneTarget = {
  kind: DialPhoneKind;
  raw: string;
  e164: string;
};

/** Virksomhed Tlf / Privat Tlf — synlighed i dialerens kunde-panel. */
export function visibleLeadPhoneFields(
  phone: string,
  privatePhone: string,
): { showCompany: boolean; showPrivate: boolean } {
  const hasCompany = phone.trim().length > 0;
  const hasPrivate = privatePhone.trim().length > 0;
  if (!hasCompany && !hasPrivate) return { showCompany: true, showPrivate: false };
  return { showCompany: hasCompany, showPrivate: hasPrivate };
}

/**
 * Gyldige opkaldsmål i prioriteret rækkefølge.
 * Dubletter (samme E.164) fjernes — kun ét forsøg pr. unikt nummer.
 */
export function orderedDialPhones(
  phone: string,
  privatePhone?: string | null,
  priority: DialPhonePriority = DIAL_PHONE_PRIORITY_DEFAULT,
): DialPhoneTarget[] {
  const companyRaw = typeof phone === "string" ? phone.trim() : "";
  const privateRaw = typeof privatePhone === "string" ? privatePhone.trim() : "";
  const companyE164 = companyRaw ? normalizePhoneToE164ForDial(companyRaw) : null;
  const privateE164 = privateRaw ? normalizePhoneToE164ForDial(privateRaw) : null;

  const privateTarget: DialPhoneTarget | null =
    privateE164 && privateRaw ? { kind: "PRIVATE", raw: privateRaw, e164: privateE164 } : null;
  const companyTarget: DialPhoneTarget | null =
    companyE164 && companyRaw ? { kind: "COMPANY", raw: companyRaw, e164: companyE164 } : null;

  const ordered =
    priority === "COMPANY_FIRST"
      ? [companyTarget, privateTarget]
      : [privateTarget, companyTarget];

  const out: DialPhoneTarget[] = [];
  const seen = new Set<string>();
  for (const t of ordered) {
    if (!t) continue;
    if (seen.has(t.e164)) continue;
    seen.add(t.e164);
    out.push(t);
  }
  return out;
}

/** Primært opkaldsnummer ud fra kampagnens prioritet. */
export function primaryDialPhone(
  phone: string,
  privatePhone?: string | null,
  priority: DialPhonePriority = DIAL_PHONE_PRIORITY_DEFAULT,
): string {
  return orderedDialPhones(phone, privatePhone, priority)[0]?.raw ?? "";
}

export function primaryDialPhoneE164(
  phone: string,
  privatePhone?: string | null,
  priority: DialPhonePriority = DIAL_PHONE_PRIORITY_DEFAULT,
): string | null {
  return orderedDialPhones(phone, privatePhone, priority)[0]?.e164 ?? null;
}

/** Næste nummer efter et mislykket forsøg (samme E.164 tæller som brugt). */
export function nextDialPhoneAfterFailure(
  phone: string,
  privatePhone: string | null | undefined,
  failedE164: string,
  priority: DialPhonePriority = DIAL_PHONE_PRIORITY_DEFAULT,
): DialPhoneTarget | null {
  const failed = normalizePhoneToE164ForDial(failedE164) ?? failedE164.trim();
  const ordered = orderedDialPhones(phone, privatePhone, priority);
  const idx = ordered.findIndex((t) => t.e164 === failed);
  if (idx < 0) {
    // Ukendt mislykket nummer — prøv første der ikke matcher
    return ordered.find((t) => t.e164 !== failed) ?? null;
  }
  return ordered[idx + 1] ?? null;
}

/**
 * Vælg nummer til Power Dialer.
 * - Ingen pending failover → første i prioriteret rækkefølge
 * - Pending = E.164 der allerede fejlede → næste nummer
 * Power dialer ringer begge (når begge findes) via failover efter fejl.
 */
export function pickPowerDialTarget(params: {
  phone: string;
  privatePhone?: string | null;
  priority: DialPhonePriority;
  /** E.164 der allerede fejlede i denne kontaktcyklus (tom = start forfra). */
  dialFailoverPendingE164?: string | null;
}): DialPhoneTarget | null {
  const ordered = orderedDialPhones(params.phone, params.privatePhone, params.priority);
  if (ordered.length === 0) return null;
  const pending = (params.dialFailoverPendingE164 ?? "").trim();
  if (!pending) return ordered[0] ?? null;
  const pendingE164 = normalizePhoneToE164ForDial(pending) ?? pending;
  return ordered.find((t) => t.e164 !== pendingE164) ?? null;
}

export function leadHasAnyPhone(phone: string, privatePhone?: string | null): boolean {
  return hasLeadPhone(phone) || hasLeadPhone(privatePhone ?? "");
}

/**
 * Personfelter (stifter/direktør/FAD): kun felter med værdi.
 * Har ledet ingen personværdier → vis kun «Fuldt ansvarlig deltager» tom.
 */
export function visiblePersonExtensionFields(
  custom: Record<string, string>,
  cfg: CampaignFieldConfig,
): CampaignExtraField[] {
  const keys = resolveFixedPersonFieldKeys(cfg);
  const byCanonical: CampaignExtraField[] = [
    { key: keys.stifter, label: "Stifter" },
    { key: keys.direktor, label: "Direktør" },
    { key: keys.fuldtAnsvarligPerson, label: "Fuldt ansvarlig deltager" },
  ];

  const companyExt = cfg.extensions.companyName ?? [];
  const withCampaignLabels = byCanonical.map((f) => {
    const fromCfg = companyExt.find((e) => e.key === f.key);
    return fromCfg ?? f;
  });

  const withValues = withCampaignLabels.filter((f) => (custom[f.key] ?? "").trim().length > 0);
  if (withValues.length > 0) return withValues;

  const fad =
    withCampaignLabels.find((f) => f.key === keys.fuldtAnsvarligPerson) ??
    FIXED_PERSON_EXTENSION_FIELDS.find((f) => f.key === "fuldt_ansvarlig_person")!;
  return [fad];
}

/** True hvis extension-feltet er et af de faste personfelter (inkl. remappede nøgler). */
export function isVisiblePersonFieldKey(key: string, cfg: CampaignFieldConfig): boolean {
  if (isFixedPersonExtensionKey(key)) return true;
  const keys = resolveFixedPersonFieldKeys(cfg);
  return key === keys.stifter || key === keys.direktor || key === keys.fuldtAnsvarligPerson;
}

/** Kort pause før Power Dialer ringer 2. nummer efter fejl på 1. */
export const POWER_PHONE_FAILOVER_REQUEUE_MS = 2_000;
