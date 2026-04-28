/**
 * Normaliserer til E.164 til udgående opkald (primært danske 8-cifrede numre).
 * Returnerer null hvis input ikke kan bruges sikkert.
 */
export function normalizePhoneToE164ForDial(raw: string): string | null {
  const s = raw.replace(/[\s\-\.\u00A0()]/g, "").trim();
  if (!s) return null;

  if (s.startsWith("+")) {
    const digits = s.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  let digitsOnly = s.replace(/\D/g, "");
  if (!digitsOnly) return null;

  if (digitsOnly.startsWith("00")) {
    digitsOnly = digitsOnly.slice(2);
  }

  if (digitsOnly.length === 8) {
    return `+45${digitsOnly}`;
  }

  if (digitsOnly.length === 10 && digitsOnly.startsWith("45")) {
    return `+${digitsOnly}`;
  }

  if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
    return `+${digitsOnly}`;
  }

  return null;
}

/**
 * Cifre-only repræsentation til matching mellem Telnyx (E.164) og lead.phone
 * (ofte 8 cifre uden +45). Returnerer null hvis nummeret ikke kan normaliseres.
 */
export function phoneDigitsForMatch(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const e164 = normalizePhoneToE164ForDial(raw.trim());
  if (!e164) return null;
  const d = e164.replace(/\D/g, "");
  return d.length >= 8 ? d : null;
}

/** Mulige `lead.phone`-varianter i DB for ét normaliseret cifferstreng (fx 4535357020). */
export function phoneStoredVariantsForQuery(digits: string): string[] {
  const out = new Set<string>();
  out.add(digits);
  out.add(`+${digits}`);
  if (digits.startsWith("45") && digits.length === 10) {
    const local8 = digits.slice(2);
    out.add(local8);
    out.add(`0${local8}`);
  }
  return [...out];
}
