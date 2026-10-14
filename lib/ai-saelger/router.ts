/**
 * Routeren: Jev (TypeSafe AI, «System One»-beslutningsmodel, ca. 70 ms) vælger ét punkt fra en fast
 * menu ud fra kundens (måske ufærdige) tur, før Claude skriver svaret, og vurderer løbende, om agenten
 * skal bryde ind. Valget styrer, om agenten uddyber, håndterer en indvending, bryder ind eller går i
 * lukning. Claude Haiku med ét ords svar (routerSystemPrompt) er reserve.
 */

export const ROUTER_LABELS = [
  "vil_hoere_mere",
  "indvending",
  "forkert_antagelse",
  "koebssignal",
  "spoergsmaal",
  "tilbagekald",
  "nyt_nummer",
  "robinson",
  "spoerger_om_ai",
  "afvisning",
  "backchannel",
  "taler_for_meget",
  "andet",
] as const;

export type RouterLabel = (typeof ROUTER_LABELS)[number];

/** Menuen med forklaring (indgår i routerens systemprompt). */
export const ROUTER_MENU: Readonly<Record<RouterLabel, string>> = {
  vil_hoere_mere: "kunden er nysgerrig eller beder om mere",
  indvending: "kunden har en indvending (pris, tid, «send en mail», har system, skal tale med partner …)",
  forkert_antagelse:
    "kunden tror, vi er noget, vi ikke er: marketingbureau, et nyt bookingsystem, flere unødvendige udgifter, eller sælgere (vi er mødebookere)",
  koebssignal: "kunden er positiv eller spørger til næste skridt, så gå i lukning",
  spoergsmaal: "kunden stiller et konkret spørgsmål",
  tilbagekald: "kunden vil tales ved på et andet tidspunkt",
  nyt_nummer: "kunden giver et andet nummer eller en anden person at ringe til",
  robinson: "kunden siger Robinson-listen, reklamebeskyttet eller «fjern mig fra listen»",
  spoerger_om_ai: "kunden spørger, om det er en robot eller AI",
  afvisning: "et klart og endeligt nej",
  backchannel: "kun «mm», «ja», «okay» mens agenten taler (lytter bare)",
  taler_for_meget: "kunden taler længe uden at komme nogen vegne",
  andet: "intet af ovenstående",
};

export function routerSystemPrompt(): string {
  const menu = ROUTER_LABELS.map((l) => `${l}: ${ROUTER_MENU[l]}`).join("\n");
  return `Du klassificerer kundens seneste tur i en dansk telefonsamtale, hvor en mødebooker fra Allio ringer til en klinik. Teksten kan være ufærdig. Svar med præcis ét ord fra listen og intet andet.\n\n${menu}`;
}

/** Robust parsing af routerens svar (fx «Indvending.» eller «label: koebssignal»). */
export function parseRouterLabel(raw: string): RouterLabel {
  const text = raw.toLowerCase().replace(/ø/g, "oe").replace(/æ/g, "ae").replace(/å/g, "aa");
  return ROUTER_LABELS.find((l) => new RegExp(`\\b${l}\\b`).test(text)) ?? "andet";
}

/** Labels, hvor agenten må bryde ind, selv om kunden ikke er færdig. */
export const BARGE_IN_LABELS: ReadonlySet<RouterLabel> = new Set(["forkert_antagelse", "taler_for_meget"]);
