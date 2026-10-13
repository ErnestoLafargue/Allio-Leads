/**
 * Live-coach, lag 1: genkender kundens indvending på de første ord (også mens kunden stadig taler)
 * og viser straks det bedste svar — uden AI-kald. Svarene kommer fra det aktive «ugens script»
 * (bygget på jeres egne samtaler) med de foretrukne svar som reserve.
 */
import { ALLIO_PRICE_TEXT } from "@/lib/allio-offer";
import type { ObjectionCategory } from "@/lib/call-analysis/schema";

export type CoachSignal = "tryghed" | "klarhed" | "okonomi" | "skepsis" | "timing" | "lav_interesse";

export type ObjectionTrigger = {
  category: ObjectionCategory;
  signal: CoachSignal;
  /** 3–6 ord: hvad kunden mangler */
  why: string;
  patterns: RegExp[];
};

/**
 * Rækkefølgen betyder noget: den første indvending, der matcher, vinder. Mønstrene er bygget ud fra
 * kundernes egne formuleringer i de analyserede samtaler (dansk og engelsk) — måles med
 * scripts/live-coach-trigger-eval.ts (træfsikkerhed pr. kategori og falske alarmer).
 */
export const OBJECTION_TRIGGERS: ObjectionTrigger[] = [
  {
    category: "send_email",
    signal: "skepsis",
    why: "Vil skubbe beslutningen væk",
    patterns: [
      /\bsend(e|er)?\b.{0,40}\b(e-?mail|mail|sms)\b/,
      /\bpå (en |min |vores |hendes )?(e-?mail|mail)\b/,
      /\b(få|have|læse) (en |det på )?(e-?mail|mail)\b/,
      /\bsend (me |us )?(the |an )?e-?mail\b/,
    ],
  },
  {
    category: "price",
    signal: "okonomi",
    why: "Kender ikke værdien endnu",
    patterns: [
      /\bkoste[rt]?\b/,
      /\bpris(en|erne)?\b/,
      /\bbetale\b/,
      /\bpenge\b/,
      /\bdyrt?\b/,
      /\bgratis\b/,
      /\bkrone[r]?\b/,
      /\bråd til\b|\bbudget\b/,
      /\bhow much\b|\bprice\b|\bcosts?\b/,
    ],
  },
  {
    category: "has_booking_system",
    signal: "klarhed",
    why: "Tror Allio er et nyt system",
    patterns: [
      /\bbooking ?system(et)?\b|\bbookingkalender\b|\bbooking selv\b/,
      /\b(har|bruger) (allerede )?(et |en )?booking/,
      /\b(planway|onlinebooq|onlinebook|geckobook|gecko|easypractice|ordinationen|timbooking|tim (&|og) booking|salonized|fresha|bookbeauty)\b/,
      /\b(ikke|ikke interesseret i at) skifte\b|\bskifte (til )?(bookingsystem|system|kalender)\b/,
      /\b(andet|eget) system\b/,
    ],
  },
  {
    category: "has_agency",
    signal: "klarhed",
    why: "Tror I erstatter bureauet",
    patterns: [
      /\b(marketing|markedsføring)(sfirma|sbureau|team|en)?\b/,
      /\b(bureau|reklamebureau|marketingbureau)\b/,
      /\bannonce(r|ring)\b/,
      /\bliciteret ud\b|\banother company\b|\bstyrer det\b/,
    ],
  },
  {
    category: "talk_to_partner",
    signal: "tryghed",
    why: "Skal have makker med",
    patterns: [
      /\b(min|mine|vores) (partner|kompagnon|mand|kone|chef|kollega|kolleger|ansatte|medejer)\b/,
      /\b(snakke|tale|drøfte|diskutere) (det )?(lige )?med (ham|hende|dem)\b/,
      /\bikke mig,? der (ejer|bestemmer)\b|\bto,? der bestemmer\b/,
      /\b(hendes|hans) (butik|klinik|salon)\b/,
    ],
  },
  {
    category: "fully_booked",
    signal: "lav_interesse",
    why: "Tror de ikke mangler kunder",
    patterns: [
      /\bfuld(t)? ?booket\b|\bfully booked\b|\bfyldt op\b|\b(ret|rimelig) booket\b/,
      /\b(mangler|brug for) (faktisk )?(ikke|ingen) (flere )?kunder\b|\bikke brug for flere\b/,
      /\bventetid\b|\bkapacitet\b|\bhøjsæson\b/,
      /\bikke (plads|tider)\b|\bthat'?s enough\b/,
    ],
  },
  {
    category: "bad_timing",
    signal: "timing",
    why: "Forkert tidspunkt lige nu",
    patterns: [
      /\b(ring|ringe|vende tilbage|kontakte)\b.{0,30}\b(senere|i morgen|på (mandag|tirsdag|onsdag|torsdag|fredag)|om \d+|i slutningen|til (efteråret|foråret)|næste (uge|måned)|(et )?andet tidspunkt)\b/,
      /\b(relevant|aktuelt) lige nu\b|\bpå nuværende tidspunkt\b/,
      /\bcall (me )?(a bit )?later\b|\bcall later\b/,
      /\bvente og se\b|\btil (efteråret|foråret)\b|\befter (sommer(en)?|jul(en)?|nytår)\b|\bi det nye år\b/,
    ],
  },
  {
    category: "no_time",
    signal: "timing",
    why: "Ser ikke tid til det",
    patterns: [
      /\b(har ikke|ingen|ikke ret meget|ikke rigtig) tid\b/,
      /\btravlt\b|\boptaget\b|\bskynd dig\b/,
      /\b(står|er) (lige )?med en kunde\b|\bkunden lige nu\b|\bhar en kunde\b|\bmidt i en\b/,
      /\bnødt til at bede dig\b|\bi'?m working\b|\bwith patients\b/,
    ],
  },
  {
    category: "think_about_it",
    signal: "tryghed",
    why: "Usikker, mangler konkret grund",
    patterns: [/\b(tænke|tygge) (lidt )?(over|på) det\b/, /\boverveje\b/, /\bthink about it\b/, /\bbeslutte mig\b/],
  },
  {
    category: "not_interested",
    signal: "lav_interesse",
    why: "Ser ikke relevansen endnu",
    patterns: [
      /\bikke (rigtig )?interesse(ret)?\b|\binteresserer (mig|os) ikke\b|\bingen interesse\b|\bnot interested\b/,
      /\bnej tak\b|\bikke relevant\b|\bikke et match\b|\bspilde (jeres|din) tid\b/,
      /\b(ikke|ingen) brug for (jer|det)\b|\b(ikke|ingen) (vil )?(give |giver )?mening\b/,
    ],
  },
];

/** Foretrukne svar (allio-business), bruges når ugens script ikke har et svar på indvendingen. */
export const DEFAULT_RESPONSES: Partial<Record<ObjectionCategory, string>> = {
  has_booking_system:
    "Det er jo godt — Allio er ikke et nyt bookingsystem. Vi hjælper med det, der sker før og efter bookingen: flere genbesøg og genaktivering af de kunder, I allerede har.",
  has_agency:
    "Fint — vi erstatter ikke bureauet. De skaffer kunderne, vi sørger for, at I får mere ud af dem bagefter.",
  no_time:
    "Det forstår jeg godt. Derfor kommer vi ud til jer og kigger på jeres egne tal — det tager en time, og så ved du, om der er noget at komme efter.",
  price: `Vi arbejder kun med klinikker, hvor der er værdi at hente – det viser specialisten ud fra jeres egne data. Er der værdi, koster hele setuppet ${ALLIO_PRICE_TEXT}.`,
  bad_timing:
    "Helt fair. Hvornår passer det bedre? Lad os sætte et konkret tidspunkt nu, så du slipper for at tænke på det.",
  send_email:
    "Det kan jeg godt, men en mail viser kun Allio generelt. Det interessante er, hvad det betyder for jer med jeres egne tal — skal vi ikke tage en time på det?",
};

export type CoachCard = {
  source: "trigger" | "ai";
  category: ObjectionCategory | null;
  signal: CoachSignal;
  why: string;
  line: string;
};

export function normalizeSpeech(text: string): string {
  return text.toLowerCase().replace(/[.,!?;:"«»()]/g, " ").replace(/\s+/g, " ").trim();
}

/** Finder den første indvending i kundens seneste ord (tekst kan være ufærdig). */
export function detectObjection(customerText: string): ObjectionTrigger | null {
  const text = normalizeSpeech(customerText);
  if (!text) return null;
  return OBJECTION_TRIGGERS.find((t) => t.patterns.some((p) => p.test(text))) ?? null;
}

/** Straks-kortet til en indvending: ugens script først, ellers det foretrukne svar. */
export function triggerCard(
  trigger: ObjectionTrigger,
  scriptResponses: Partial<Record<ObjectionCategory, string>>,
): CoachCard | null {
  const line = scriptResponses[trigger.category] ?? DEFAULT_RESPONSES[trigger.category];
  if (!line) return null;
  return { source: "trigger", category: trigger.category, signal: trigger.signal, why: trigger.why, line };
}

/**
 * Telefonsvarere og omstillinger: coachen skal ikke reagere på en maskine. Mønstrene er bygget ud fra
 * de rigtige telefonsvarere i jeres optagelser («efter tonen», «du har ringet til», «læg en besked»,
 * «tryk 1», «vent venligst» …).
 *  - voicemail: telefonsvarer — coachen er tavs resten af opkaldet.
 *  - ivr: omstilling, kø eller menu — coachen holder pause, til en person svarer.
 */
export type MachineKind = "voicemail" | "ivr";

const VOICEMAIL_PATTERNS: RegExp[] = [
  /\btelefonsvar(er|eren)?\b|\bmobilsvar(er|et)?\b|\bvoice ?mail\b|\bsvarservice\b/,
  /\bindtal(e|er)?\b|\blæg (gerne )?(en |din |venligst en )?(besked|meddelelse)\b|\b(efterlad|efterlade) (en )?besked\b/,
  /\befter (tonen|bippet|biplyden|klartonen|signalet)\b/,
  /\b(personen|den person|nummeret),? du (forsøger|prøver) at (kontakte|ringe til|få fat i)\b/,
  /\b(er|kan) ikke (tilgængelig|træffes)\b|\bkan ikke tage (telefonen|dit opkald|imod)\b/,
  /\buden for (vores )?(normale )?åbningstid\b|\bvores åbningstid(er)? er\b/,
  /\bthe (person|number) you (are|have) (calling|called|trying)\b|\bleave (a|your) message\b|\bafter the (tone|beep)\b|\bnot available\b/,
];

const IVR_PATTERNS: RegExp[] = [
  /\b(tryk|tast|press) (\d|en|et|to|tre|fire|fem|nul|zero|one|two)\b/,
  /\bvent venligst\b|\bplease hold\b|\bvenligst vent\b|\btak fordi du venter\b/,
  /\b(viderestil\w*|stilles? (nu )?(om|videre)|stillet (om|videre)|omstil\w*)\b/,
  /\bdu er (nu )?(nummer \w+|placeret) i køen\b|\bi køen\b/,
  /\bfølgende (valg)?muligheder\b/,
  /\bdu har ringet til\b|\btak fordi du ringer\b|\btak for dit opkald\b/,
  /^(hej,? |goddag,? )?(og )?velkommen (til|hos)\b/,
];

/** Lyder kundens kanal som en maskine? Telefonsvarer vinder over omstilling. */
export function detectMachine(customerText: string): MachineKind | null {
  const text = normalizeSpeech(customerText);
  if (!text) return null;
  if (VOICEMAIL_PATTERNS.some((p) => p.test(text))) return "voicemail";
  if (IVR_PATTERNS.some((p) => p.test(text))) return "ivr";
  return null;
}

/**
 * Købssignaler: kunden spørger, hvordan/hvornår det foregår, eller siger, det lyder interessant.
 * Giver intet straks-kort — men får AI til at vurdere med det samme, om det er tid til at lukke.
 */
const BUYING_PATTERNS: RegExp[] = [
  /\bhvordan (foregår|fungerer|virker) (det|sådan|møde)/,
  /\bhvornår (kan|kunne|skulle|vil) (i|vi|han|hun|den)\b/,
  /\blyder (da |faktisk |egentlig |jo )*(rigtig |meget )?(spændende|interessant|godt|fint|smart|fornuftigt)\b/,
  /\b(det|det kunne være|det er) (da )?(rigtig )?(interessant|spændende)\b/,
  /\bhvad (skal|kræver|gør) (jeg|vi)\b/,
  /\bhvad sker der (så|nu)\b/,
  /\b(ja|jo),? (lad os|det kan vi godt|gerne|send)\b/,
  /\bhvor (lang|langt|lang tid)\b.{0,20}\b(tager|varer)\b/,
];

export function detectBuyingSignal(customerText: string): boolean {
  const text = normalizeSpeech(customerText);
  return Boolean(text) && BUYING_PATTERNS.some((p) => p.test(text));
}
