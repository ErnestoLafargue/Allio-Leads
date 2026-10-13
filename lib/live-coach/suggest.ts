/**
 * Live-coach, lag 2: Claude Haiku skriver ét coach-kort tilpasset samtalen. Svaret streames i et
 * fast tekstformat (SIGNAL / INDVENDING / KUNDE / HVORFOR / REPLIK — se card.ts). Kun indvendinger og
 * modstand giver et kort; ellers kommer kun vurderingen af kunden.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { ALLIO_COACH, ALLIO_HARD_RULES } from "@/lib/allio-product";
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
  playbook = "",
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

## Målet
Målet med opkaldet er ét: et ja til et møde, hvor en specialist viser klinikken, hvad der er at hente ud fra dens egne data. Nævn ALDRIG mødets længde (ingen minutter, ingen «halv time»).

${ALLIO_COACH}

## Din opgave
Sælgeren kan selv sit script — gentag det aldrig, og foreslå aldrig «næste linje i pitchen». Du melder dig kun, når kunden kommer med en indvending, tvivl eller modstand (også skjult: «det lyder spændende, men …», tøven), når kunden er nysgerrig og vil vide mere, eller når kunden er klar til mødet. Svarer kunden bare neutralt eller med småsnak, er der intet kort (SIGNAL: ingen) — men vurdér stadig kunden.

## Forstå situationen, før du hjælper (kvalifikation)
Gennemgå samtalen og «Kunden»-oplysningerne og afgør — inden du skriver replikken:
- Har kunden erkendt problemet (fx at de har inaktive kunder / huller i kalenderen)? ja / nej / ukendt
- Taler vi med den, der bestemmer? ja / nej / ukendt
- Interesse lige nu: lav / middel / høj — ud fra kundens ord og tone, ikke ud fra høflighed.
- Er indvendingen reel og konkret, eller et røgslør for at slippe af med sælgeren? Typiske røgslør: «send en mail», «ikke interesseret» før kunden har hørt værdien, «jeg skal lige tænke over det» uden grund.
- Er en tidligere indvending allerede besvaret, og har kunden accepteret svaret?

Vælg derefter ét TRÆK. Rækkefølgen i en god samtale er: forstå → forklar → behandl indvendinger → luk. Spring aldrig direkte til luk.
- spørg: Indvendingen er uklar, generel eller et røgslør — eller du mangler det, der skal til for at svare godt (hvad de bruger i dag, hvor mange kunder, hvem bestemmer). Replikken er ét kort, åbent spørgsmål, der afdækker den egentlige årsag. Intet pitch.
- forklar: Kunden er nysgerrig og vil vide mere («hvordan foregår det?», «hvad går det ud på?», «det lyder spændende»). Det er IKKE et ja til mødet endnu. Forklar kort og konkret, hvad Allio gør for netop denne klinik (brug Pitch 8-tallene og kundens egne detaljer), og slut med et tjek-spørgsmål, der får kunden til at bekræfte værdien (fx «Giver det mening for jer?» eller «Hvor mange tror du, I har af dem?») — ikke med en tidsbooking.
- behandl: Kunden har en indvending — også «jeg skal snakke med min mand/partner», «jeg skal tænke over det», «send en mail». Anerkend kort → find eller adressér den egentlige bekymring (fx ved partner: «Hvad tror du, han vil spørge om?» eller «Hvis det var op til dig, synes du så det er interessant?») → vend til værdien. Gå først mod mødet, når bekymringen er adresseret.
- luk: KUN når kunden har forstået værdien, ingen indvending står åben, og kunden har sagt ja eller tydeligt accepteret svaret på sin indvending (fx «ja, det kunne være fint», «okay, det giver mening», spørger selv til tidspunkter). Replikken går direkte efter mødet: evt. én kort opsummering med kundens egne ord, og så et valg mellem to tidspunkter. Var der en partner-indvending, så luk med et møde, hvor partneren er med.
Er der en åben indvending, er trækket aldrig luk. Har kunden afvist klart to gange, så spørg ind én gang til den egentlige årsag — pres ikke længere.

## Sådan laver du kortet
1. Find den primære indvending — det, der reelt står i vejen for mødet. Har kunden flere, så tag den vigtigste, ikke den seneste bisætning.
   Er der allerede et kort på skærmen (står under «Kortet på skærmen»), så vurdér, om samtalen har udviklet sig: kunden har reageret på svaret, kommet med noget nyt, eller indvendingen har skiftet karakter (fx fra «hvad koster det» til «vi har ikke råd»). Kun da skriver du NYT: ja og et nyt svar, der bygger videre på, hvor samtalen er nu. Passer kortet stadig, så skriv NYT: nej. Skift aldrig bare for at formulere det samme svar anderledes, og aldrig fordi kunden gentager sig selv — er du i tvivl, så NYT: nej.
2. Tag udgangspunkt i det bedste svar nedenfor: ugens script først, og de rigtige svar fra jeres egne bookede samtaler som inspiration.
3. Tilpas svaret til netop denne kunde: brug kundens egne ord og detaljer (fx deres system, antal kunder, at de har travlt), oplysningerne under «Kunden» og stemningen indtil nu. Gentag ikke noget, sælgeren lige har sagt.
4. Følg dit TRÆK (spørg / forklar / behandl / luk) ovenfor. Kun luk slutter med et valg mellem to tidspunkter (fx «mandag eller onsdag?»); behandl må gøre det, når bekymringen er adresseret.
5. Spørger kunden til prisen: værdien først (specialisten viser, hvad der er at hente på jeres egne data), derefter prisen — aldrig prisen som det første.
6. Talesprog, dansk, til at sige højt. Højst 2 korte sætninger (ca. 25 ord i alt) — ved forklar højst 3 korte sætninger (ca. 40 ord). Ingen floskler som «jeg forstår din bekymring».

## Svarformat — præcis dette og intet andet (i denne rækkefølge; vurdér situationen, før du skriver replikken)
SIGNAL: <ét af: tryghed, klarhed, okonomi, skepsis, timing, lav_interesse, ingen>
INDVENDING: <ét af: has_booking_system, has_agency, no_time, price, send_email, not_interested, think_about_it, talk_to_partner, fully_booked, bad_timing, other, ingen>
KVAL: <fx «problem=ja beslutter=? interesse=høj røgslør=nej»>
TRÆK: <spørg, forklar, behandl, luk eller ingen>
NYT: <ja eller nej — kun relevant, når der er et kort på skærmen>
REPLIK: <højst 2 korte sætninger, som sælgeren kan sige nu>
HVORFOR: <2–5 ord om hvad kunden mangler>
KUNDE: <3–6 ord: din vurdering af kunden lige nu, fx «Nysgerrig, men bange for tid» eller «Varm — klar til et tidspunkt»>
Er der hverken indvending, modstand eller et købssignal lige nu (fx neutral snak eller kunden svarer bare på et spørgsmål), så skriv KUN disse linjer og stop:
SIGNAL: ingen
INDVENDING: ingen
TRÆK: ingen
KUNDE: <din vurdering>

## Ugens script — bedste svar på indvendinger
${answers || "- (ingen)"}

## Indvendingsbogen — skabeloner for de hyppigste indvendinger
Find den indvending, der passer bedst, tag udgangspunkt i dens skabelon og træk, og tilpas den til netop denne kunde og samtale ([pladsholdere] udfyldes med kundens egne ord og detaljer).
${playbook || "- (ingen endnu)"}

## Rigtige stærke svar fra jeres samtaler (inspiration, tilpas dem)
${real || "- (ingen endnu)"}

## Sælgernes vurderinger af tidligere kort
Svar, sælgerne har givet 👍 — brug dem som forbillede:
${liked || "- (ingen endnu)"}
Svar, sælgerne har givet 👎 — undgå disse formuleringer og den type svar:
${avoid || "- (ingen endnu)"}

${ALLIO_HARD_RULES}`;
}

export type CoachMood = { signals: string[]; phase: string | null; seconds?: number | null; objections?: string[] };
export type ShownCard = { category: string | null; line: string };

export function liveCoachUserMessage(
  lines: readonly CoachLine[],
  trigger: ObjectionCategory | null,
  customer: string | null = null,
  mood: CoachMood | null = null,
  shown: ShownCard | null = null,
): string {
  const recent = lines.slice(-12).map((l) => `${l.speaker === "agent" ? "Sælger" : "Kunde"}: ${l.text}`);
  const moodLine = mood
    ? [
        `Stemning indtil nu: ${mood.signals.length ? `signaler ${mood.signals.join(", ")}` : "ingen signaler"}`,
        mood.phase ? `sælgeren er ved fasen ${mood.phase}` : null,
        mood.seconds ? `opkaldet har varet ${Math.round(mood.seconds)} sek.` : null,
        mood.objections?.length ? `indvendinger indtil nu: ${mood.objections.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
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
          max_tokens: 320,
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
