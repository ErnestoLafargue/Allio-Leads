/** Marker Allio-Native bookinger der stammer fra Allio-Leads (til webhook-match). */

const PREFIX = "allio-leads:";

export function buildAllioNativeNotes(leadId: string, extra?: string): string {
  const base = `${PREFIX}${leadId}`;
  const rest = (extra ?? "").trim();
  if (!rest) return base;
  return `${base}\n${rest}`.slice(0, 5000);
}

export function parseLeadIdFromAllioNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/allio-leads:([a-zA-Z0-9_-]+)/);
  return m?.[1] ?? null;
}
