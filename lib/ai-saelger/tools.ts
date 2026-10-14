/**
 * Værktøjerne, AI-mødebookeren kan bruge under samtalen (Claude tool use). Udførelsen ligger i
 * stemmeserveren og genbruger samme kode som sælgerne (booking, udfald, tilbagekald, mail).
 * SMS kommer, når Allio Leads kan sende SMS.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { LEAD_STATUSES } from "@/lib/lead-status";

export const AI_SAELGER_TOOLS: Anthropic.Tool[] = [
  {
    name: "find_ledige_tider",
    description:
      "Find mødetider hos første ledige specialist (næsten altid Victor) inden for 14 dage, i den rækkefølge de skal tilbydes (fredag/torsdag først, så onsdag). Mandag/tirsdag kun hvis kunden ikke kan andre dage.",
    input_schema: {
      type: "object",
      properties: {
        tillad_mandag_tirsdag: { type: "boolean", description: "Kun når kunden har sagt, at de ikke kan onsdag–fredag." },
      },
    },
  },
  {
    name: "book_moede",
    description:
      "Book det fysiske møde (45–60 min), hvor specialisten kommer ud og viser Allio. Kun på en tid fra find_ledige_tider, og kun når kunden har sagt ja til tid og sted.",
    input_schema: {
      type: "object",
      properties: {
        dag: { type: "string", description: "YYYY-MM-DD" },
        tid: { type: "string", description: "HH:MM" },
        adresse: { type: "string", description: "Hvor mødet holdes (klinikkens adresse, bekræftet af kunden)." },
        kontaktperson: { type: "string", description: "Navnet på den, der deltager." },
        email: { type: "string", description: "Kundens mail til bekræftelsen." },
      },
      required: ["dag", "tid", "adresse", "kontaktperson"],
    },
  },
  {
    name: "beregn_potentiale",
    description:
      "Regn tallene ud til denne kunde, når du kender antal kunder i kartoteket (og gerne prisen pr. behandling): inaktive, genbookinger om måneden og kroner. Brug tallene i stedet for at regne selv.",
    input_schema: {
      type: "object",
      properties: {
        kunder_i_kartotek: { type: "number" },
        pris_pr_behandling: { type: "number", description: "Kr. pr. typisk behandling, hvis kendt." },
      },
      required: ["kunder_i_kartotek"],
    },
  },
  {
    name: "skriv_note",
    description:
      "Gem en note på leadet til specialisten, der tager ud: bookingsystem, antal kunder i kartoteket, om prisen er nævnt og reaktionen, hvad de har brugt før, beslutningstagere, andet relevant. Brug den løbende.",
    input_schema: {
      type: "object",
      properties: { note: { type: "string" } },
      required: ["note"],
    },
  },
  {
    name: "aftal_tilbagekald",
    description:
      "Planlæg et tilbagekald til dig selv (fx når beslutningstageren ikke er der, eller kunden vil tales ved senere). Du ringer selv op og husker samtalen via noterne.",
    input_schema: {
      type: "object",
      properties: {
        tidspunkt: { type: "string", description: "ISO 8601, dansk tid." },
        hvem: { type: "string", description: "Hvem der skal tales med." },
        grund: { type: "string" },
      },
      required: ["tidspunkt", "grund"],
    },
  },
  {
    name: "nyt_nummer",
    description:
      "Kunden giver et andet nummer eller en anden person. Gemmer nummeret og ringer det op efter samtalen, med henvisning til samtalen med den første kontakt.",
    input_schema: {
      type: "object",
      properties: {
        nummer: { type: "string", description: "Telefonnummer som sagt af kunden, fx «20 30 40 50»." },
        navn: { type: "string" },
        henvisning: { type: "string", description: "Hvem der henviste og hvad der blev sagt, så du kan bruge det i åbningen." },
      },
      required: ["nummer"],
    },
  },
  {
    name: "send_email",
    description: "Send en mail gennem Allio Leads (fx bekræftelse af mødet eller Gecko-mailen). Brug ikke mail som erstatning for et møde.",
    input_schema: {
      type: "object",
      properties: {
        til: { type: "string" },
        skabelon: { type: "string", enum: ["moedebekraeftelse", "gecko_integration"] },
      },
      required: ["til", "skabelon"],
    },
  },
  {
    name: "saet_udfald",
    description: "Sæt opkaldets udfald (samme udfald som sælgerne). Altid til sidst i samtalen.",
    input_schema: {
      type: "object",
      properties: { udfald: { type: "string", enum: [...LEAD_STATUSES.filter((s) => s !== "NEW")] } },
      required: ["udfald"],
    },
  },
  {
    name: "afslut_samtale",
    description: "Læg på efter en naturlig afslutning.",
    input_schema: { type: "object", properties: {} },
  },
];

export type AiSaelgerToolName =
  | "find_ledige_tider"
  | "beregn_potentiale"
  | "book_moede"
  | "skriv_note"
  | "aftal_tilbagekald"
  | "nyt_nummer"
  | "send_email"
  | "saet_udfald"
  | "afslut_samtale";
