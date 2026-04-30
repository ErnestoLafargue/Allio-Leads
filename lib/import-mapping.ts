import { buildNormRow, normKey } from "./import-parse-helpers";
import { parseFieldConfig } from "./campaign-fields";
import type { FieldGroupKey } from "./campaign-fields";

export type StandardMappingId =
  | "skip"
  | "companyName"
  | "phone"
  | "email"
  | "cvr"
  | "domain"
  | "address"
  | "postalCode"
  | "city"
  | "industry"
  | "notes";

export const STANDARD_MAPPING_OPTIONS: { id: StandardMappingId; label: string }[] = [
  { id: "skip", label: "Ignorer" },
  { id: "companyName", label: "Virksomhedsnavn" },
  { id: "phone", label: "Telefonnummer" },
  { id: "notes", label: "Noter" },
  { id: "email", label: "E-mail" },
  { id: "domain", label: "Domæne / hjemmeside" },
  { id: "cvr", label: "CVR-nummer" },
  { id: "address", label: "Adresse" },
  { id: "postalCode", label: "Postnr." },
  { id: "city", label: "By" },
  { id: "industry", label: "Branche" },
];

/**
 * Gæt mapping ud fra kolonnenavne (kan rettes i UI).
 */
export function suggestColumnMapping(columns: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of columns) {
    const n = normKey(col);
    let t: StandardMappingId | string = "skip";
    if (
      n.includes("reklamebeskyttet") ||
      (n.includes("reklame") && n.includes("beskytt")) ||
      n.includes("marketingbeskyttelse") ||
      n === "reklame_beskyttet"
    ) {
      t = "custom:reklamebeskyttet";
    } else if (
      n.includes("virksomhedsform") ||
      n.includes("selskabsform") ||
      n.includes("organisationsform") ||
      n.includes("company_form") ||
      (n.includes("form") && (n.includes("virksom") || n.includes("selskab")))
    ) {
      t = "custom:virksomhedsform";
    } else if (
      n.includes("virksomhedsnavn") ||
      n.includes("firmanavn") ||
      n.includes("firma_navn") ||
      n === "company_name" ||
      n === "companyname"
    ) {
      t = "companyName";
    } else if (
      n === "navn" ||
      n === "name" ||
      (n.includes("virksom") && !n.includes("form")) ||
      n === "firma" ||
      n.includes("company") ||
      n === "kontakt"
    ) {
      t = "companyName";
    } else if (n.includes("telefon") || n === "phone" || n === "tlf" || n.includes("mobil")) {
      t = "phone";
    } else if (
      n === "email" ||
      n === "mail" ||
      n === "epost" ||
      n === "e_post" ||
      n.includes("e_mail") ||
      n.includes("e-mail")
    ) {
      t = "email";
    } else if (
      n.includes("domain") ||
      n.includes("hjemmeside") ||
      n.includes("website") ||
      n === "url" ||
      n === "web" ||
      n === "webside"
    ) {
      t = "domain";
    } else if (n.includes("cvr")) {
      t = "cvr";
    } else if (n.includes("adresse") || n === "address" || n === "addr") {
      t = "address";
    } else if (
      n.includes("postnr") ||
      n.includes("post_nr") ||
      n.includes("postnummer") ||
      n.includes("postal") ||
      n === "zip" ||
      n === "postcode" ||
      n === "post_code"
    ) {
      t = "postalCode";
    } else if (n === "by" || n === "city" || n === "town" || n.includes("bynavn") || n === "sted") {
      t = "city";
    } else if (n.includes("branche") || n === "industry" || n === "sektor") {
      t = "industry";
    } else if (n.includes("noter") || n === "notes" || n.includes("kommentar")) {
      t = "notes";
    }
    out[col] = t;
  }
  return out;
}

export type MappingRecord = Record<string, string>;

/**
 * Anvender brugerens mapping: bygger et syntetisk række-objekt som pickBase/collectCustomForstår.
 */
export function applyColumnMapping(
  row: Record<string, string>,
  mapping: MappingRecord,
): Record<string, string> {
  const flat: Record<string, string> = {};

  for (const [col, val] of Object.entries(row)) {
    const target = mapping[col];
    if (!target || target === "skip") continue;
    const v = val == null ? "" : String(val).trim();

    switch (target) {
      case "companyName":
        flat.virksomhed = v;
        break;
      case "phone":
        flat.telefon = v;
        break;
      case "email":
        flat.email = v;
        break;
      case "cvr":
        flat.cvr = v;
        break;
      case "domain":
        flat.domain = v;
        break;
      case "address":
        flat.adresse = v;
        break;
      case "postalCode":
        flat.postnr = v;
        break;
      case "city":
        flat.by = v;
        break;
      case "industry":
        flat.branche = v;
        break;
      case "notes":
        flat.noter = flat.noter ? `${flat.noter}\n${v}` : v;
        break;
      default:
        if (target.startsWith("custom:")) {
          const key = target.slice(7);
          flat[key] = v;
        }
        break;
    }
  }

  return buildNormRow(flat);
}

export function pickBaseFromNorm(n: Record<string, string>) {
  const companyName =
    n["virksomhed"] ||
    n["virksomhedsnavn"] ||
    n["company"] ||
    n["company_name"] ||
    n["firma"] ||
    n["navn"] ||
    n["name"] ||
    "";
  const phone =
    n["telefon"] ||
    n["telefonnummer"] ||
    n["phone"] ||
    n["tlf"] ||
    n["mobil"] ||
    "";
  const email = n["email"] || n["e_mail"] || n["mail"] || "";
  const cvr = n["cvr"] || n["cvr_nummer"] || n["cvrnummer"] || "";
  const address = n["adresse"] || n["address"] || n["addr"] || "";
  const postalCode =
    n["postnr"] ||
    n["postnummer"] ||
    n["postal_code"] ||
    n["postal"] ||
    n["zip"] ||
    n["postcode"] ||
    "";
  const city = n["by"] || n["city"] || n["town"] || n["sted"] || "";
  const industry = n["branche"] || n["industry"] || n["sektor"] || "";
  const notes = n["noter"] || n["notes"] || n["kommentar"] || "";
  return {
    companyName: companyName.trim(),
    phone: phone.trim(),
    email: email.trim(),
    cvr: cvr.trim(),
    address: address.trim(),
    postalCode: postalCode.trim(),
    city: city.trim(),
    industry: industry.trim(),
    notes: notes.trim(),
  };
}

export function collectCustomFromRow(
  n: Record<string, string>,
  cfg: ReturnType<typeof parseFieldConfig>,
): Record<string, string> {
  const out: Record<string, string> = {};

  for (const g of Object.keys(cfg.extensions) as FieldGroupKey[]) {
    const extras = cfg.extensions[g];
    if (!extras?.length) continue;
    for (const f of extras) {
      const nk = normKey(f.label);
      const byLabel = n[nk] ?? n[normKey(f.label.replace(/\s+/g, "_"))];
      const byKey = n[normKey(f.key)];
      const val = (byLabel || byKey || "").trim();
      if (val) out[f.key] = val;
    }
  }

  return out;
}
