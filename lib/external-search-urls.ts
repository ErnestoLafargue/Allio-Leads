import { normalizeCVR } from "@/lib/cvr-import";

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

export function openExternalUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}
