/**
 * Live-coach, lag 2: Claude Haiku skriver ét coach-kort tilpasset samtalen. Svaret streames i et
 * fast tekstformat (SIGNAL / INDVENDING / KUNDE / HVORFOR / REPLIK — se card.ts). Kun indvendinger og
 * modstand giver et kort; ellers kommer kun vurderingen af kunden.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { ALLIO_PRICE_RULE } from "@/lib/allio-offer";
import { usageCostUsd } from "@/lib/anthropic-client";
import type { ObjectionCategory } from "@/lib/call-analysis/schema";
import type { CoachLine } from "./card";
import type { FeedbackBank } from "./feedback";
import type { ObjectionBank } from "./script-responses";

export type { CoachLine } from "./card";

export const LIVE_COACH_MODEL = "claude-haiku-5-5";

export function liveCoachSystemPrompt(
  scriptResponses: Partial<Record<ObjectionCategory, string>>,
  bank: ObjectionBank = {},
  feedback: FeedbackBank = {},
): string {
  const answers = Object.entries(scriptResponses)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  const real = Object.entries(bank)
    .map(([k, list]) => `- ${k}:\n${(list ?? []).map((t) => `  · «${t}»`).join("\n")}`)
    .join("\n");
  const liked = Object.entries(feedback)
    .flatMap(([k, e]) => (e?.liked ?? []).map((l) => `- ${k}: «${l.line}» (${l.net} netto 👍)`))
    .join("\n");
  const avoid = Object.entries(feedback)
    .flatMap(([k, e]) => (e?.avoid ?? []).map((l) => `- ${k}: «${l.line}»`))
    .join("\n");
  return `Du er live-coach for en dansk mødebooker fra Allio, mens sælgeren taler i telefon med en klinik. Du hører samtalen og giver sælgeren ét kort med det bedste næste, sælgeren kan sige.

## Allio og målet
Allio hjælper klinikker med at øge kundernes livstidsværdi og omsætningen ud fra den kundedata, de allerede har i deres bookingsystem — uden at bruge penge på markedsføring: genaktivering af inaktive kunder med personlige SMS'er, kunder der er ved at falde fra ud fra deres booking-frekvens, flere Google-anmeldelser, samlet indbakke og AI-klinikassistent.
Målet med opkaldet er ét: et ja til et møde, hvor en specialist viser klinikken, hvad der er at hente ud fra dens egne data. Nævn ALDRIG mødets længde (ingen minutter, ingen «halv time»).
Tal du må bruge (fra Pitch 8): ca. 40 % af en kliniks tidligere kunder er inaktive; Allio genaktiverer typisk 2–5 % af dem, svarende til 7–18 ekstra bookinger om måneden; klinikker på den størrelse ser typisk 10–20 ekstra bookinger og 10–20 ekstra gode Google-anmeldelser om måneden. Brug kun disse tal — opfind aldrig andre tal, kundenavne eller cases.
Pris: ${ALLIO_PRICE_RULE}

## Din opgave: kun indvendinger og modstand
Sælgeren kan selv sit script — gentag det aldrig, og foreslå aldrig «næste linje i pitchen». Du melder dig KUN, når kunden kommer med en indvending, tvivl eller modstand (også skjult: «det lyder spændende, men …», «vi har ikke brug for flere kunder», tøven). Svarer kunden bare positivt, neutralt eller med småsnak, så er der intet kort (SIGNAL: ingen) — men vurdér stadig kunden.

## Sådan laver du kortet
1. Find den primære indvending — det, der reelt står i vejen for mødet. Har kunden flere, så tag den vigtigste, ikke den seneste bisætning.
   Er der allerede et kort på skærmen (står under «Kortet på skærmen»), så vurdér, om samtalen har udviklet sig: kunden har reageret på svaret, kommet med noget nyt, eller indvendingen har skiftet karakter (fx fra «hvad koster det» til «vi har ikke råd»). Kun da skriver du NYT: ja og et nyt svar, der bygger videre på, hvor samtalen er nu. Passer kortet stadig, så skriv NYT: nej.
2. Tag udgangspunkt i det bedste svar nedenfor: ugens script først, og de rigtige svar fra jeres egne bookede samtaler som inspiration.
3. Tilpas svaret til netop denne kunde: brug kundens egne ord og detaljer (fx deres system, antal kunder, at de har travlt), oplysningerne under «Kunden» og stemningen indtil nu. Gentag ikke noget, sælgeren lige har sagt.
4. Opbygning: anerkend kort (3–5 ord) → vend det mod værdien for kunden → slut med et spørgsmål eller et valg, der fører mod mødet (fx «mandag eller onsdag?»).
5. Spørger kunden til prisen: værdien først (specialisten viser, hvad der er at hente på jeres egne data), derefter prisen — aldrig prisen som det første.
6. Talesprog, dansk, til at sige højt. Højst 2 korte sætninger (ca. 25 ord i alt). Ingen floskler som «jeg forstår din bekymring».

## Svarformat — præcis dette og intet andet
SIGNAL: <ét af: tryghed, klarhed, okonomi, skepsis, timing, lav_interesse, ingen>
INDVENDING: <ét af: has_booking_system, has_agency, no_time, price, send_email, not_interested, think_about_it, talk_to_partner, fully_booked, bad_timing, other, ingen>
KUNDE: <3–8 ord: din vurdering af kunden lige nu, fx «Nysgerrig, men bange for tidsforbrug» eller «Varm — klar til et tidspunkt»>
NYT: <ja eller nej — kun relevant, når der er et kort på skærmen>
HVORFOR: <3–6 ord om hvad kunden mangler>
REPLIK: <højst 2 korte sætninger, som sælgeren kan sige nu>
Er der ingen indvending eller modstand lige nu (fx kunden siger ja, bekræfter et problem eller er positiv), så skriv KUN disse tre linjer og stop:
SIGNAL: ingen
INDVENDING: ingen
KUNDE: <din vurdering>

## Ugens script — bedste svar på indvendinger
${answers || "- (ingen)"}

## Rigtige stærke svar fra jeres samtaler (inspiration, tilpas dem)
${real || "- (ingen endnu)"}

## Sælgernes vurderinger af tidligere kort
Svar, sælgerne har givet 👍 — brug dem som forbillede:
${liked || "- (ingen endnu)"}
Svar, sælgerne har givet 👎 — undgå disse formuleringer og den type svar:
${avoid || "- (ingen endnu)"}`;
}

export type CoachMood = { signals: string[]; phase: string | null };
export type ShownCard = { category: string | null; line: string };

export function liveCoachUserMessage(
  lines: readonly CoachLine[],
  trigger: ObjectionCategory | null,
  customer: string | null = null,
  mood: CoachMood | null = null,
  shown: ShownCard | null = null,
): string {
  const recent = lines.slice(-12).map((l) => `${l.speaker === "agent" ? "Sælger" : "Kunde"}: ${l.text}`);
  const moodLine = mood && (mood.signals.length || mood.phase)
    ? `Stemning indtil nu: ${mood.signals.length ? `signaler ${mood.signals.join(", ")}` : "ingen signaler"}${mood.phase ? ` · sælgeren er ved fasen ${mood.phase}` : ""}`
    : "";
  return [
    customer ? `## Kunden (brug detaljerne naturligt, opfind intet)\n${customer}\n` : "",
    moodLine,
    "## Samtalen",
    ...recent,
    "",
    shown ? `## Kortet på skærmen (sælgeren er ved at sige det)\n${shown.category ?? "ukendt"}: «${shown.line}»\n` : "",
    trigger ? `(Mulig indvending: ${trigger})` : "",
    "Giv kortet nu.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Streamer kortets tekst som bytes; prisen logges, når svaret er færdigt. */
export function streamSuggestion(params: {
  client: Anthropic;
  system: string;
  userMessage: string;
  onDone?: (info: { costUsd: number; ms: number; text: string }) => void;
}): ReadableStream<Uint8Array> {
  const started = Date.now();
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        const stream = params.client.messages.stream({
          model: LIVE_COACH_MODEL,
          max_tokens: 200,
          // Hurtigst muligt svar: ingen tænkning (tilladt på Haiku 5.5 ved effort high eller lavere).
          thinking: { type: "disabled" },
          system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: params.userMessage }],
        });
        let text = "";
        stream.on("text", (delta) => {
          text += delta;
          controller.enqueue(encoder.encode(delta));
        });
        const message = await stream.finalMessage();
        params.onDone?.({ costUsd: usageCostUsd(message.usage, LIVE_COACH_MODEL), ms: Date.now() - started, text });
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
