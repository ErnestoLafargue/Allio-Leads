/**
 * Udtræk dansk postnummer (og by) fra en adresse-streng.
 * Typisk format: «Gadenavn 12, 2100 København Ø» eller «Gadenavn 12 2100 København».
 */

const DK_POSTAL_WITH_CITY =
  /(?:^|[\s,;])(\d{4})\s+([A-Za-zÆØÅæøåÜüÖöÄäéÉ.\-\s]+?)(?:\s*[,;]|$)/u;
const DK_POSTAL_ONLY = /(?:^|[\s,;])(\d{4})(?!\d)/;

export type ParsedDanishAddressParts = {
  postalCode: string;
  city: string;
};

/**
 * Finder 4-cifret dansk postnr i adresse. Returnerer null hvis intet troværdigt træf.
 * Undgår husnumre der ikke er postnr ved at kræve postnr + bynavn når muligt,
 * ellers det første 4-cifrede tal efter komma/semikolon.
 */
export function extractDanishPostalFromAddress(
  address: string | null | undefined,
): ParsedDanishAddressParts | null {
  const raw = String(address ?? "").trim();
  if (!raw) return null;

  const withCity = raw.match(DK_POSTAL_WITH_CITY);
  if (withCity) {
    const postalCode = withCity[1];
    const city = withCity[2].trim().replace(/\s+/g, " ");
    if (isPlausibleDkPostal(postalCode) && city.length >= 2) {
      return { postalCode, city };
    }
  }

  // Fallback: postnr efter komma, fx «Gade 12, 2100»
  const afterComma = raw.match(/,\s*(\d{4})(?!\d)/);
  if (afterComma && isPlausibleDkPostal(afterComma[1])) {
    return { postalCode: afterComma[1], city: "" };
  }

  const only = raw.match(DK_POSTAL_ONLY);
  if (only && isPlausibleDkPostal(only[1])) {
    // Undgå husnumre midt i vejen (fx «vej 2100 12») — kræv at resten ligner by eller er slut
    const idx = raw.indexOf(only[1]);
    const after = raw.slice(idx + 4).trim();
    if (!after || /^[A-Za-zÆØÅæøå]/.test(after)) {
      const city = after.replace(/[,;].*$/, "").trim();
      return { postalCode: only[1], city };
    }
  }

  return null;
}

/** Danske postnr er 1000–9999 (ikke 0000–0999). */
function isPlausibleDkPostal(code: string): boolean {
  const n = Number(code);
  return Number.isFinite(n) && n >= 1000 && n <= 9999;
}

/** Brug gemt postalCode; ellers udtræk fra adresse. */
export function effectivePostalCode(
  postalCode: string | null | undefined,
  address?: string | null,
): string {
  const direct = String(postalCode ?? "").trim();
  if (direct) return direct;
  return extractDanishPostalFromAddress(address)?.postalCode ?? "";
}

/** Brug gemt city; ellers udtræk fra adresse sammen med postnr. */
export function effectiveCity(
  city: string | null | undefined,
  address?: string | null,
  postalCode?: string | null,
): string {
  const direct = String(city ?? "").trim();
  if (direct) return direct;
  if (String(postalCode ?? "").trim()) return "";
  return extractDanishPostalFromAddress(address)?.city ?? "";
}
