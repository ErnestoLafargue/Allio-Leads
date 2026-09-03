export type AnnoncerStatusKind = "aktiv" | "inaktiv" | "ikke_registreret";

export type AnnoncerStatusDisplay = {
  kind: AnnoncerStatusKind;
  label: string;
};

/**
 * Mapper rå importværdi (True/False/andet/tom) til dialer-label.
 * Sammenligning er trim + case-insensitive.
 */
export function formatAnnoncerStatus(raw: string | null | undefined): AnnoncerStatusDisplay {
  const t = (raw ?? "").trim().toLowerCase();
  if (t === "true") return { kind: "aktiv", label: "Aktiv" };
  if (t === "false") return { kind: "inaktiv", label: "Inaktiv" };
  return { kind: "ikke_registreret", label: "Ikke registreret" };
}

function titleCaseChannelToken(token: string): string {
  return token
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Opdeler kommaseparerede kanaler (fx youtube_ads,google_maps_ads),
 * fjerner suffiks `_ads`, erstatter `_` med mellemrum og title-caser.
 */
export function formatAnnoncerKanaler(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  return s
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      let t = part.toLowerCase();
      if (t.endsWith("_ads")) t = t.slice(0, -4);
      t = t.replace(/_/g, " ").trim();
      return titleCaseChannelToken(t);
    })
    .filter(Boolean)
    .join(", ");
}
