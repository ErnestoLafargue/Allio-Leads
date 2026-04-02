import { normalizeCVR } from "@/lib/cvr-import";

/**
 * Matcher kampagnefelter der skal have Krak (personsøgning): stifter, direktør, FAD.
 * Case-insensitive; danske tegn bevares i visning, matching er tolerant.
 */
export function isKrakPersonFieldLabel(label: string): boolean {
  const t = label.trim().toLowerCase();
  if (!t) return false;
  const noAccent = t.normalize("NFD").replace(/\p{M}/gu, "");
  // Navn på stifter
  if (t.includes("stifter") && (t.includes("navn") || t.includes("på"))) return true;
  // Direktør
  if (t.includes("direktør") || noAccent.includes("direktor")) return true;
  // Fuldt ansvarlig deltager / FAD
  if (t.includes("fuldt ansvarlig") || /\bfad\b/i.test(t) || t.includes("(fad)")) return true;
  return false;
}

export function buildKrakUrl(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const formatted = trimmed.toLowerCase().replace(/\s+/g, "+");
  return `https://www.krak.dk/${formatted}/personer`;
}

export function buildVirkUrl(rawCvr: string): string | null {
  const cvr = rawCvr.trim().replace(/\s+/g, "");
  const normalized = normalizeCVR(cvr);
  if (!normalized) return null;
  return `https://datacvr.virk.dk/enhed/virksomhed/${normalized}?fritekst=${normalized}&sideIndex=0&size=10`;
}

export function openExternalUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}
