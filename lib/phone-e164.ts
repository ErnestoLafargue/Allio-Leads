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
