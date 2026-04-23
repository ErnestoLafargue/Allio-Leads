import { normalizeCVR } from "@/lib/cvr-import";

/**
 * Krak (personsøgning) kun for relevante personfelter — ikke for øvrige ekstrafelter.
 * Matcher typisk: stifter, direktør, fuldt ansvarlig deltager / FAD.
 */
export function isKrakPersonFieldLabel(label: string): boolean {
  const t = label.trim().toLowerCase();
  if (!t) return false;
  const noAccent = t.normalize("NFD").replace(/\p{M}/gu, "");
  if (t.includes("stifter") && (t.includes("navn") || t.includes("på"))) return true;
  if (t.includes("direktør") || noAccent.includes("direktor")) return true;
  if (t.includes("fuldt ansvarlig") || /\bfad\b/i.test(t) || t.includes("(fad)")) return true;
  return false;
}

/** Felter der typisk indeholder hjemmeside/domæne. */
export function isWebsiteFieldLabel(label: string): boolean {
  const t = label.trim().toLowerCase();
  if (!t) return false;
  const noAccent = t.normalize("NFD").replace(/\p{M}/gu, "");
  return (
    t.includes("hjemmeside") ||
    t.includes("domæne") ||
    noAccent.includes("domaene") ||
    t.includes("website") ||
    t.includes("webside") ||
    t.includes("url")
  );
}

/** Krak personsøgning — bruges når feltet har indhold (alle kampagner). */
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

/** Google websøgning ud fra fritekst (fx virksomhedsnavn). */
export function buildGoogleSearchUrl(query: string): string | null {
  const t = query.trim();
  if (!t) return null;
  return `https://www.google.com/search?q=${encodeURIComponent(t)}`;
}

/** Direkte åbning af hjemmeside/domæne fra feltværdi. */
export function buildWebsiteUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t || /\s/.test(t)) return null;
  const normalized = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const parsed = new URL(normalized);
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function openExternalUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}
