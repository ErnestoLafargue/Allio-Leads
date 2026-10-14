/**
 * «Træn Adrian»: Ernesto ser en kundereplik (et rigtigt citat fra jeres analyserede samtaler eller en fast
 * situation), siger sit svar højt, og svaret gemmes som en lektion (AiSaelgerLesson). Adrian får
 * lektionerne i sin systemprompt («Sådan svarer Ernesto»), sammen med de stærkeste svar fra sælgernes
 * egne samtaler (svarbanken). Ernestos svar vægter højest.
 */
import type { ObjectionCategory } from "@/lib/call-analysis/schema";
import { OBJECTION_LABELS } from "@/lib/scripts-traening/labels";

/** Faste situationer ud over indvendingskategorierne, med typiske kundereplikker. */
export const FIXED_SITUATIONS = {
  aabning: { label: "Åbningen (kunden tager telefonen)", lines: ["Ja, det er Mette.", "Klinik Nordlys, det er Sara.", "Hallo?", "Ja, hvem taler jeg med?"] },
  gatekeeper: { label: "Receptionist / gatekeeper", lines: ["Hvad drejer det sig om?", "Han er i behandling. Kan jeg tage en besked?", "Det er mig, der tager mig af den slags."] },
  hvad_er_det: { label: "«Hvad er det for noget?»", lines: ["Hvad er det for noget?", "Hvad går det ud på?", "Hvor ringer du fra?", "Hvad er Allio?"] },
  saelger: { label: "«Prøver du at sælge mig noget?» / «Er du sælger?»", lines: ["Prøver du at sælge mig noget?", "Er du sælger?", "Er det et salgsopkald?"] },
  robot: { label: "«Er du en robot?»", lines: ["Er du en robot?", "Er det her AI?", "Taler jeg med en rigtig person?"] },
  lukning: { label: "Lukningen (kunden er positiv)", lines: ["Okay, det lyder faktisk spændende.", "Hm, det kunne godt være interessant.", "Hvad sker der så nu?"] },
} as const satisfies Record<string, { label: string; lines: readonly string[] }>;

export type FixedSituation = keyof typeof FIXED_SITUATIONS;

/** Lektioner fra 👍/👎 i «Tal med Adrian» (ikke et øvekort). */
export const FROM_CALL_SITUATION = "fra_samtale";
export type TrainingCategory = Exclude<ObjectionCategory, "other">;
export type Situation = TrainingCategory | FixedSituation;

export const TRAINING_CATEGORIES = (Object.keys(OBJECTION_LABELS) as ObjectionCategory[]).filter((c): c is TrainingCategory => c !== "other");

export function situationLabel(s: string): string {
  if (s === FROM_CALL_SITUATION) return "Fra samtaler med Adrian";
  return (FIXED_SITUATIONS as Record<string, { label: string }>)[s]?.label ?? OBJECTION_LABELS[s as ObjectionCategory] ?? s;
}

/** Situation for en lektion (øvekortenes situationer + lektioner fra samtaler). */
export function isLessonSituation(s: string): boolean {
  return s === FROM_CALL_SITUATION || isSituation(s);
}

export function isSituation(s: string): s is Situation {
  return s in FIXED_SITUATIONS || (TRAINING_CATEGORIES as readonly string[]).includes(s);
}

export const ALL_SITUATIONS: readonly Situation[] = [...(Object.keys(FIXED_SITUATIONS) as FixedSituation[]), ...TRAINING_CATEGORIES];

export type Lesson = {
  situation: string;
  customerLine: string;
  answer: string;
  avoidAnswer?: string | null;
  /** +1 (👍) / -1 (👎) fra «Tal med Adrian»; null for øvekort. */
  rating?: number | null;
  reason?: string | null;
  context?: string | null;
  routerLabel?: string | null;
};

/** Én lektion som tekst til Adrian (med Ernestos begrundelse). */
export function formatLesson(l: Lesson): string {
  const why = l.reason ? `\n  Hvorfor: ${l.reason}` : "";
  if (l.rating === 1) return `- Kunden: «${l.customerLine}»\n  Godt svar (gør det igen): «${l.answer}»${why}`;
  return `- Kunden: «${l.customerLine}»${l.avoidAnswer ? `\n  Ikke sådan: «${l.avoidAnswer}»` : ""}\n  Ernesto: «${l.answer}»${why}`;
}

/**
 * Lag 2 (relevans): op til `n` lektioner fra samtaler med samme Jev-label som kundens replik lige nu,
 * nyeste først. Lægges i turens besked (ikke systemprompten), så prompt-cachen ikke brydes.
 */
export function relevantLessonsHint(lessons: readonly Lesson[], routerLabel: string | null | undefined, n = 3): string {
  if (!routerLabel) return "";
  const hits = lessons.filter((l) => l.situation === FROM_CALL_SITUATION && l.routerLabel === routerLabel).slice(0, n);
  return hits.length ? `[Ernesto har rettet dig i lignende situationer:\n${hits.map(formatLesson).join("\n")}]` : "";
}

/**
 * Sektionen til Adrians systemprompt. Ernestos lektioner først (højst `perSituation` nyeste pr. situation),
 * derefter svarbanken fra sælgernes samtaler. Tom streng, hvis der intet er.
 */
export function lessonsPromptSection(
  lessons: readonly Lesson[],
  bank: Partial<Record<ObjectionCategory, string[]>> = {},
  perSituation = 4,
  principles = "",
): string {
  const limit = (s: string) => (s === FROM_CALL_SITUATION ? 8 : perSituation);
  const bySituation = new Map<string, Lesson[]>();
  for (const l of lessons) {
    const list = bySituation.get(l.situation) ?? [];
    if (list.length < limit(l.situation)) list.push(l);
    bySituation.set(l.situation, list);
  }
  const ernesto = [...bySituation.entries()].map(
    ([s, list]) => `### ${situationLabel(s)}\n${list.map(formatLesson).join("\n")}`,
  );
  const banked = Object.entries(bank)
    .filter(([, list]) => list?.length)
    .map(([c, list]) => `- ${situationLabel(c)}: ${list!.map((t) => `«${t}»`).join(" / ")}`);
  if (!ernesto.length && !banked.length && !principles.trim()) return "";
  return [
    principles.trim()
      ? `## Adrians principper (lært af Ernestos feedback, godkendt af ham)\nFølg dem altid; de går forud for playbookens formuleringer.\n${principles.trim()}`
      : "",
    ernesto.length
      ? `## Sådan svarer Ernesto (din træner)\nDet er sådan, Ernesto selv ville svare. Brug hans ord, rækkefølge og logik, når situationen ligner; tilpas til samtalen, og gentag ikke ordret, hvis det ikke passer. Hans svar går forud for alt andet her og for playbookens formuleringer.\n\n${ernesto.join("\n\n")}`
      : "",
    banked.length ? `## Stærke svar fra sælgernes rigtige samtaler\nOrdrette svar, der virkede (samtaler, der endte med møde, først). Til inspiration.\n${banked.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
