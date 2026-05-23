import { stripDialFormatting } from "@/lib/phone-e164";

/**
 * Danske 8-cifrede telefonnummer til dublet-match (ikke E.164).
 * Returnerer null hvis nummeret ikke kan normaliseres sikkert.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = stripDialFormatting(String(raw));
  if (!s) return null;

  let digits = s.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("45") && digits.length >= 10) {
    digits = digits.slice(2);
  }

  if (digits.length === 8) {
    return digits;
  }

  return null;
}
