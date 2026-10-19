/**
 * Fører beriget data fra GeckoBooking-Excel (ark «Leads» + «Ændringslog») ind i kampagnen «Gecko Booking».
 *
 * Regler:
 *  - Kun rækker der matcher et lead på domæne opdateres automatisk. CVR-/telefon-match → gennemgang.
 *  - Tomme felter udfyldes; eksisterende værdier overskrives ikke.
 *  - Undtagelser: skrald-navne («Forside», «Hjem», «Kontakt», «Log ind», …) og virksomhedstype «Ukendt»
 *    erstattes; reklamebeskyttet Nej → Ja.
 *  - privatePhone udfyldes kun med mobilnumre ≠ firmanummer (kampagnen ringer PRIVATE_FIRST).
 *  - Status ændres aldrig, og der oprettes ingen leads.
 *
 * Standard er dry-run mod dev-branchen (.env.branch). Skriver kun med --apply.
 * Dry-run må læse produktion (--env .env.local); skrivning dér kræver også --confirm-production.
 *
 *   npx tsx scripts/import-geckobooking-enrichment.ts <fil.xlsx>
 *   npx tsx scripts/import-geckobooking-enrichment.ts <fil.xlsx> --apply
 *   npx tsx scripts/import-geckobooking-enrichment.ts --rollback out/gecko-enrichment/<run>/backup.json --apply
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { canonicalLeadPhoneForStorage } from "@/lib/phone-e164";

const PRODUCTION_HOST = "ep-wandering-violet";
const CAMPAIGN_NAME = "Gecko Booking";
const JUNK_NAMES = /^(forside|hjem|home|log ind|login|kontakt|velkommen|booking|\(uden virksomhedsnavn\))$/i;
/** Danske mobilnummerserier (første cifre) — fastnet/omstilling havner i gennemgang. */
const MOBILE_PREFIX = /^(2\d|30|31|40|41|42|50|51|52|53|60|61|71|81|91|92|93)/;

type Row = Record<string, string>;
type Change = { leadId: string; lead: string; domain: string; field: string; before: string; after: string; rule: string };
type Review = { leadId: string; lead: string; domain: string; matchedVia: string; field: string; allio: string; file: string; reason: string };

const t = (v: unknown) => String(v ?? "").trim();
const normDomain = (v: unknown) =>
  t(v).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
const digits8 = (v: unknown) => {
  let d = t(v).replace(/\D/g, "");
  if (d.startsWith("0045")) d = d.slice(4);
  if (d.length === 10 && d.startsWith("45")) d = d.slice(2);
  return d;
};
const loose = (v: unknown) => t(v).toLowerCase().replace(/\s+/g, " ").replace(/\s*[\/,]\s*/g, ",");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function openDb() {
  const envFile = arg("--env") ?? ".env.branch";
  const url = parseEnv(fs.readFileSync(envFile)).DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL mangler i ${envFile}`);
  const host = url.replace(/^.*@([^/]+)\/.*$/, "$1");
  const isProd = host.includes(PRODUCTION_HOST);
  if (isProd && process.argv.includes("--apply") && !process.argv.includes("--confirm-production")) {
    throw new Error(`${envFile} peger på PRODUKTION (${host}). Kræver --confirm-production.`);
  }
  console.log(`Database: ${host} (${isProd ? "PRODUKTION" : "dev"}) via ${envFile}`);
  return { prisma: new PrismaClient({ datasources: { db: { url } } }), isProd };
}

function writeSheets(file: string, sheets: Record<string, object[]>) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ "(ingen)": "" }]), name);
  }
  XLSX.writeFile(wb, file);
}

/** «Gade 1, 2650 Hvidovre» → postnr + by. */
function splitAddress(full: string) {
  const m = full.match(/,\s*(\d{4})\s+(.+)$/);
  return { address: full, postalCode: m?.[1] ?? "", city: m?.[2]?.trim() ?? "" };
}

async function rollback(backupFile: string, apply: boolean) {
  const backup = JSON.parse(fs.readFileSync(backupFile, "utf8")) as {
    leads: Array<Record<string, string> & { id: string }>;
    campaign: { id: string; fieldConfig: string };
  };
  const { prisma } = openDb();
  console.log(`Gendanner ${backup.leads.length} leads + kampagnens fieldConfig${apply ? "" : " (dry-run)"}`);
  if (apply) {
    for (const l of backup.leads) {
      const { id, ...data } = l;
      await prisma.lead.update({ where: { id }, data });
    }
    await prisma.campaign.update({ where: { id: backup.campaign.id }, data: { fieldConfig: backup.campaign.fieldConfig } });
  }
  await prisma.$disconnect();
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rb = arg("--rollback");
  if (rb) return rollback(rb, apply);

  const xlsxFile = process.argv[2];
  if (!xlsxFile || xlsxFile.startsWith("--")) throw new Error("Angiv Excel-filen som første argument.");
  const wb = XLSX.readFile(xlsxFile);
  const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets["Leads"], { defval: "" });
  const log = XLSX.utils.sheet_to_json<Row>(wb.Sheets["Ændringslog"] ?? {}, { defval: "" });
  const reasonFor = (domain: string, field: string) =>
    log
      .filter((e) => normDomain(e["Domæne"]) === domain && t(e["Felt"]) === field)
      .map((e) => `${t(e["Type"])}: ${t(e["Begrundelse"])}`)
      .join("; ");

  const { prisma, isProd } = openDb();
  const campaign = await prisma.campaign.findFirst({ where: { name: CAMPAIGN_NAME } });
  if (!campaign) throw new Error(`Kampagnen «${CAMPAIGN_NAME}» findes ikke.`);
  const leads = await prisma.lead.findMany({
    where: { campaignId: campaign.id },
    select: {
      id: true, companyName: true, phone: true, privatePhone: true, cvr: true, address: true,
      postalCode: true, city: true, industry: true, customFields: true, status: true,
    },
  });

  const domainKeys = ["domæne", "domain", "domaene", "Domæne", "hjemmeside", "website", "hjemmeside_1"];
  const parsed = leads.map((l) => {
    const cf = JSON.parse(l.customFields || "{}") as Record<string, string>;
    return { l, cf, doms: new Set(domainKeys.map((k) => normDomain(cf[k])).filter(Boolean)) };
  });
  const index = (key: (p: (typeof parsed)[number]) => string[]) => {
    const m = new Map<string, (typeof parsed)[number][]>();
    for (const p of parsed) for (const k of key(p)) if (k) m.set(k, [...(m.get(k) ?? []), p]);
    return m;
  };
  const byDomain = index((p) => [...p.doms]);
  const byCvr = index((p) => [t(p.l.cvr)]);
  const byPhone = index((p) => [digits8(p.l.phone)]);

  const review: Review[] = [];
  const unmatched: Row[] = [];
  const rowsByLead = new Map<string, Row[]>();

  for (const r of rows) {
    const domain = normDomain(r["Domæne"]);
    const hit = (domain && byDomain.get(domain)) || null;
    if (hit) {
      if (hit.length > 1) {
        review.push({ leadId: hit.map((h) => h.l.id).join(","), lead: hit.map((h) => h.l.companyName).join(" / "), domain, matchedVia: "domæne", field: "(match)", allio: "", file: t(r["Virksomhedsnavn"]), reason: "Domænet matcher flere leads — ikke opdateret" });
        continue;
      }
      rowsByLead.set(hit[0].l.id, [...(rowsByLead.get(hit[0].l.id) ?? []), r]);
      continue;
    }
    const cvr = t(r["CVR-nummer"]);
    const alt = (cvr && byCvr.get(cvr)?.length === 1 && byCvr.get(cvr)) || byPhone.get(digits8(r["Telefonnummer"])) || null;
    if (alt) {
      review.push({ leadId: alt[0].l.id, lead: alt[0].l.companyName, domain, matchedVia: cvr && byCvr.get(cvr) ? "cvr" : "telefon", field: "(match)", allio: [...alt[0].doms].join(", "), file: t(r["Virksomhedsnavn"]), reason: "Kun CVR/telefon-match, andet domæne — ikke opdateret automatisk" });
    } else {
      unmatched.push(r);
    }
  }

  const changes: Change[] = [];
  const updates: Array<{ id: string; data: Record<string, string> }> = [];
  const backupLeads: Array<Record<string, string> & { id: string }> = [];

  for (const p of parsed) {
    const fileRows = rowsByLead.get(p.l.id);
    if (!fileRows) continue;
    const domain = normDomain(fileRows[0]["Domæne"]);
    const base = { leadId: p.l.id, lead: p.l.companyName, domain };

    /** Én værdi fra filen; flere forskellige (dublet-rækker) → gennemgang. */
    const fileValue = (col: string, norm: (v: unknown) => string = loose): string => {
      const vals = [...new Map(fileRows.map((r) => [norm(r[col]), t(r[col])] as const).filter(([k]) => k)).values()];
      if (vals.length > 1) {
        review.push({ ...base, matchedVia: "domæne", field: col, allio: "", file: vals.join(" | "), reason: "Dublet-rækker i filen med forskellige værdier — ikke opdateret" });
        return "";
      }
      return vals[0] ?? "";
    };

    const data: Record<string, string> = {};
    const cf = { ...p.cf };
    const set = (field: string, before: string, after: string, rule: string) =>
      changes.push({ ...base, field, before, after, rule });
    const diff = (field: string, allio: string, file: string) =>
      review.push({ ...base, matchedVia: "domæne", field, allio, file, reason: reasonFor(domain, field) || "Forskellig værdi — Allio beholdt" });

    // Virksomhedsnavn
    const name = fileValue("Virksomhedsnavn");
    if (name && loose(name) !== loose(p.l.companyName)) {
      if (!t(p.l.companyName) || JUNK_NAMES.test(t(p.l.companyName))) {
        data.companyName = name;
        set("Virksomhedsnavn", p.l.companyName, name, "Skrald-navn erstattet");
      } else diff("Virksomhedsnavn", p.l.companyName, name);
    }

    // Telefonnummer
    const phone = fileValue("Telefonnummer", digits8);
    if (phone && digits8(phone) !== digits8(p.l.phone)) {
      if (!t(p.l.phone)) {
        data.phone = canonicalLeadPhoneForStorage(phone);
        set("Telefonnummer", "", data.phone, "Tomt felt udfyldt");
      } else diff("Telefonnummer", p.l.phone, phone);
    }

    // Privat telefon
    const priv = fileValue("Privat Telefon", digits8);
    if (priv && !t(p.l.privatePhone)) {
      const d = digits8(priv);
      const sameAsCompany = d === digits8(p.l.phone) || d === digits8(data.phone ?? "") || d === digits8(phone);
      if (sameAsCompany) {
        /* samme nummer som firma — intet at tilføje */
      } else if (d.length === 8 && MOBILE_PREFIX.test(d)) {
        data.privatePhone = canonicalLeadPhoneForStorage(priv);
        set("Privat Telefon", "", data.privatePhone, "Mobilnummer udfyldt");
      } else {
        review.push({ ...base, matchedVia: "domæne", field: "Privat Telefon", allio: "", file: priv, reason: "Ligner fastnet/omstilling — ikke sat (kampagnen ringer privat nummer først)" });
      }
    }

    // CVR
    const cvr = fileValue("CVR-nummer");
    if (cvr && cvr !== t(p.l.cvr)) {
      if (!t(p.l.cvr)) {
        data.cvr = cvr;
        set("CVR-nummer", "", cvr, "Tomt felt udfyldt");
      } else diff("CVR-nummer", p.l.cvr, cvr);
    }

    // Adresse
    const addr = fileValue("Adresse");
    if (addr) {
      if (!t(p.l.address)) {
        const a = splitAddress(addr);
        data.address = a.address;
        data.postalCode = a.postalCode;
        data.city = a.city;
        set("Adresse", "", addr, "Tomt felt udfyldt");
      } else if (loose(addr) !== loose(p.l.address)) diff("Adresse", p.l.address, addr);
    }

    // Branche (industry = «kode beskrivelse»)
    const code = fileValue("Branchekode");
    const desc = fileValue("Branchebeskrivelse");
    const industry = [code, desc].filter(Boolean).join(" ");
    if (industry) {
      if (!t(p.l.industry)) {
        data.industry = industry;
        set("Branche", "", industry, "Tomt felt udfyldt");
      } else if (code && !t(p.l.industry).startsWith(code)) diff("Branchekode", p.l.industry, industry);
    }

    // Kampagnefelter (customFields)
    const cfFields: Array<[col: string, key: string, aliases: string[]]> = [
      ["Stifter", "stifter", ["stifter_navn"]],
      ["Virksomhedsejer", "virksomhedsejer", []],
      ["Fuldt ansvarlig deltager", "fuldt_ansvarlig_person", ["fuldt_ansvarlig_deltager"]],
      ["Hjemmeside Ansvarlig", "hjemmeside_ansvarlig", []],
      ["Branchebeskrivelse", "branchebeskrivelse", []],
      ["Virksomhedstype", "virksomhedstype", []],
      ["Status", "cvr_status", []],
    ];
    for (const [col, key, aliases] of cfFields) {
      const v = fileValue(col);
      if (!v) continue;
      const existing = [key, ...aliases].map((k) => t(cf[k])).find(Boolean) ?? "";
      if (key === "virksomhedstype" && existing.toLowerCase() === "ukendt") {
        cf[key] = v;
        set(col, existing, v, "«Ukendt» erstattet");
      } else if (!existing) {
        cf[key] = v;
        set(col, "", v, "Tomt felt udfyldt");
      } else if (loose(existing) !== loose(v)) diff(col, existing, v);
    }

    // Reklamebeskyttet: udfyld tomt, opgradér Nej → Ja, ellers gennemgang
    const rb = fileValue("Reklamebeskyttet");
    if (rb) {
      const cur = t(cf.reklamebeskyttet);
      if (!cur) {
        cf.reklamebeskyttet = rb;
        set("Reklamebeskyttet", "", rb, "Tomt felt udfyldt");
      } else if (cur.toLowerCase() !== rb.toLowerCase()) {
        if (rb.toLowerCase() === "ja") {
          cf.reklamebeskyttet = "Ja";
          set("Reklamebeskyttet", cur, "Ja", "Nej → Ja (forsigtighed)");
        } else diff("Reklamebeskyttet", cur, rb);
      }
    }

    // Domæne mangler helt
    if (domain && !domainKeys.some((k) => t(cf[k]))) {
      cf["domæne"] = domain;
      set("Domæne", "", domain, "Tomt felt udfyldt");
    }

    const nextCf = JSON.stringify(cf);
    if (nextCf !== JSON.stringify(p.cf)) data.customFields = nextCf;
    if (Object.keys(data).length === 0) continue;

    updates.push({ id: p.l.id, data });
    const prev: Record<string, string> & { id: string } = { id: p.l.id };
    for (const k of Object.keys(data)) prev[k] = (p.l as unknown as Record<string, string>)[k] ?? "";
    backupLeads.push(prev);
  }

  // Kampagnen skal vise «CVR-status» som felt
  const cfg = JSON.parse(campaign.fieldConfig || "{}") as { extensions?: Record<string, Array<{ key: string; label: string }>> };
  cfg.extensions ??= {};
  cfg.extensions.cvr ??= [];
  const addStatusField = !Object.values(cfg.extensions).flat().some((f) => f.key === "cvr_status");
  if (addStatusField) cfg.extensions.cvr.push({ key: "cvr_status", label: "CVR-status" });

  const runDir = path.join("out", "gecko-enrichment", `${new Date().toISOString().replace(/[:.]/g, "-")}${isProd ? "-prod" : "-dev"}${apply ? "-apply" : "-dryrun"}`);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "backup.json"), JSON.stringify({ campaign: { id: campaign.id, fieldConfig: campaign.fieldConfig }, leads: backupLeads }, null, 1));

  const summary: Record<string, number> = {};
  for (const c of changes) summary[`${c.field} — ${c.rule}`] = (summary[`${c.field} — ${c.rule}`] ?? 0) + 1;
  writeSheets(path.join(runDir, "foer-efter.xlsx"), {
    Oversigt: [
      { Punkt: "Rækker i filen", Antal: rows.length },
      { Punkt: "Leads der ændres", Antal: updates.length },
      { Punkt: "Feltændringer i alt", Antal: changes.length },
      { Punkt: "Til manuel gennemgang", Antal: review.length },
      { Punkt: "Ikke fundet i kampagnen", Antal: unmatched.length },
      { Punkt: "Nyt kampagnefelt «CVR-status»", Antal: addStatusField ? 1 : 0 },
      ...Object.entries(summary).sort().map(([Punkt, Antal]) => ({ Punkt, Antal })),
    ],
    "Før-efter": changes.map((c) => ({ "Lead-id": c.leadId, Lead: c.lead, Domæne: c.domain, Felt: c.field, Før: c.before, Efter: c.after, Regel: c.rule })),
    Gennemgang: review.map((r) => ({ "Lead-id": r.leadId, Lead: r.lead, Domæne: r.domain, "Matchet via": r.matchedVia, Felt: r.field, Allio: r.allio, Fil: r.file, Begrundelse: r.reason })),
    "Ikke fundet": unmatched,
  });

  console.log(`Leads der ændres: ${updates.length}, feltændringer: ${changes.length}, gennemgang: ${review.length}, ikke fundet: ${unmatched.length}`);
  console.table(summary);
  console.log(`Rapport + backup: ${runDir}`);

  if (apply) {
    for (const u of updates) await prisma.lead.update({ where: { id: u.id }, data: u.data });
    if (addStatusField) await prisma.campaign.update({ where: { id: campaign.id }, data: { fieldConfig: JSON.stringify(cfg) } });
    console.log(`Skrevet: ${updates.length} leads${addStatusField ? " + kampagnefelt" : ""}.`);
  } else {
    console.log("Dry-run — intet skrevet. Tilføj --apply for at skrive.");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
