# AI-sælger: arkitektur og hvor den bygges

13/10-2026. **Status: forslag, ikke besluttet.**
I repoet står kun, at «AI-sælgere, der ringer ud» kommer senere (`docs/scripts-og-traening-goal.md`).
Der findes ingen tidligere nedskrevet plan i koden. Ligger der noter et andet sted (fx `allio-backlog`
på VPS'en), skal de flettes ind her. Dette dokument bygger på det, der allerede er bygget og målt.

## 1. Hvad den skal kunne
En AI-mødebooker, der selv ringer leads op fra en kampagne, fører samtalen efter ugens script og
**booker mødet direkte i kalenderen**, ligesom en sælger gør i dag. Målet er ét: et **fysisk møde på
45–60 min**, hvor en Allio-specialist kommer ud og viser platformen. Den sælger ikke produktet i telefonen.

Den hedder **Adrian**. Den viderestiller ikke til en kollega. Lykkes mødet ikke, aftaler den et
tilbagekald eller afslutter pænt.

## 2. Hvad vi allerede har, som den bygger på
| Behov | Findes i dag | Fil |
|---|---|---|
| Ringe ud server-side med telefonsvarer-genkendelse (AMD) | Power/predictive dialer via Telnyx Call Control | `app/api/dialer/dispatch/route.ts`, `lib/dialer-bridge.ts` (`handleAmdHuman`, `handleAmdMachine`) |
| Kø og kampagner | Dialerkø sorteret efter kontaktforsøg | `DialerQueueItem`, `Campaign`, `Lead` |
| Tale til tekst i realtid | Soniox realtime, målt ca. 0,56 sek. (teknikken genbruges, ikke coachen) | `lib/live-coach/soniox-stream.ts` |
| Hvad skal der siges | Adrians egne playbooks og salgsbibliotek, egen systemprompt, kundekontekst | `docs/ai-saelger/`, `lib/ai-saelger/` |
| Delt med de menneskelige sælgere | Kun dataanalysen (`CallAnalysis`) og de gode indvendingssvar fra den | `scripts/worker.ts`, `CallAnalysis` |
| Ledige tider og booking | Mødetider, overlap-tjek, Cal.eu og Podio | `lib/booking/meeting-slots.ts`, `app/api/meetings/book/route.ts`, `lib/booking/post-booking-sync.ts` |
| Udfald | Udfaldslog (fx MEETING_BOOKED) | `LeadOutcomeLog` |
| Optagelse og efteranalyse | Telnyx-optagelse → transskription → analyse (Adrians egne samtaler → hans playbooks) | `scripts/worker.ts`, `CallRecording`, `CallTranscript`, `CallAnalysis` |
| Log af AI-forbrug og latens | Pr. kort | `LiveCoachEvent`, `lib/live-coach/events.ts` |

**Adskillelse (Ernesto, 14/10):** live-coachen og ugens script er kun til menneskelige sælgere. Adrian
har sin egen systemprompt, egne playbooks og egne data. Det eneste, de deler, er dataanalysen og de gode
indvendingssvar. Adrian kan ikke viderestille.

## 3. Arkitektur (forslag)
```
Kampagne (Lead, DialerQueueItem)
   │  admin starter «AI-sælger» på en kampagne
   ▼
AI-dialer (server, langlivet proces)
   ├─ Telnyx Call Control: ring op med AMD  ── telefonsvarer → læg på / log som i dag
   │                                         └─ menneske → start tovejs lydstream (WebSocket)
   ▼
Stemmeagent (én pr. samtale)
   ├─ lyd ind  → Soniox realtime → tekst (kundens tur slutter ved <end>)
   ├─ hjerne   → Claude (systemprompt: ugens script + svarbank + kundekontekst)
   │             værktøjer:
   │               find_ledige_tider   → lib/booking/meeting-slots.ts
   │               book_moede          → samme kode som app/api/meetings/book
   │               saet_udfald         → LeadOutcomeLog
   │               aftal_tilbagekald   → app/api/leads/[id]/schedule-callback
   │   │               skriv_note          → noter undervejs på leadet (altid)
               nyt_nummer          → kunden giver et andet nummer: noter det, ring det op, og henvis
                                     til samtalen med den første kontakt
               send_sms / send_email → gennem Allio Leads (senere)
               afslut_samtale
   └─ lyd ud   ← tekst til tale (dansk, streaming) ← Claudes svar
   ▼
Efter opkaldet: Telnyx-optagelse → worker → CallAnalysis (præcis som for mennesker)
Log: AiCallEvent (latens, pris, værktøjskald, udfald) + administrationsvisning
```

**Vigtige valg**
- **Ikke på Vercel.** En samtale kræver en åben WebSocket i flere minutter. Det passer ikke til
  serverless. Stemmeagenten kører som en langlivet Node-proces på VPS'en (som `scripts/worker.ts`).
  Next.js-appen på Vercel styrer start/stop og viser status.
- **AI-sælgeren er en bruger.** Opret en `User` (fx «AI-sælger») og brug den som sælger på opkald,
  udfald og møder. Så virker statistik, Indsigter, leaderboard og analyse uden særregler, og AI'ens
  samtaler kan sammenlignes direkte med menneskernes.
- **Egen hjerne, ikke ugens script (Ernesto, 13/10).** Adrians systemprompt bygges sammen med Ernesto
  (spørgsmål og svar) og trænes én gang op på de bedste sælgersamtaler. Derefter lærer han kun af sine
  egne samtaler. Teknik (Soniox, streaming, kundekontekst) deles med coachen.
- **Booking går gennem samme kode som mennesker.** Overlap-tjek, Cal.eu og Podio skal ikke
  genimplementeres. Flyt logikken fra `app/api/meetings/book/route.ts` ud i en funktion i `lib/booking/`,
  som både routen og agenten kalder.
- **Ingen viderestilling.** Adrian har ét mål: mødet. Ellers et tilbagekald eller en pæn afslutning.

## 4. Latens: det sværeste
En naturlig telefonsamtale tåler ca. 1 sekunds pause. Målt i dag (live-coach, fase 0):
Soniox ca. 0,56 sek. + Claude Haiku ca. 1,1 sek. Med tekst til tale (anslået 0,2–0,4 sek.) bliver det ca.
**1,9–2 sek. pr. tur**. Det er for langsomt. Forslag:
1. **Routeren (hurtig model, ca. 70 ms) skal bygges ind** (Ernesto, 14/10). Den vurderer kundens
   foreløbige tekst løbende, så Claude kan starte, før kunden er helt færdig. Det er Adrians egen
   router, ikke live-coachens lag 1.
2. Forudindspil faste replikker: åbning, fyldlyde, svarene på de kendte indvendinger, bekræftelse.
   Routeren kan afspille dem straks uden Claude.
3. Stream hele vejen: Claudes første sætning går til tekst til tale, mens resten skrives.
4. Mindre lydpakker til Soniox (40 ms i stedet for 100 ms). Testes i fase 0; det kan spare op til ca.
   60 ms pr. tur.
5. **Fire veje testes i fase 0:** (a) vores egen kæde (Soniox → router → Claude → ElevenLabs),
   (b) samme kæde med Cartesia, (c) en tale-til-tale-model, (d) **Telnyx' egne AI-assistenter** med
   vores værktøjer koblet på. Den, der lyder mest menneskelig under ca. 1 sek., vinder.

## 4b. Turtagning: lyde som et menneske
- **Afbrydes Adrian**, reagerer han som et menneske, varieret:
  - lille «mm/ja» (backchannel) → taler videre;
  - rigtig sætning → siger sit ord/sin halve sætning færdig (højst 1–2 sek.) og stopper;
  - eller **trækker det sidste ord ud** og stopper («det jeg mente vaaaar …»);
  - eller **stopper brat** midt i ordet, når kunden siger noget vigtigt (indvending, spørgsmål).
- **Adrian må bryde ind**, når kunden er midt i en sætning, hvis routeren vurderer, at der er en vigtig
  pointe (fx en forkert antagelse om Allio, eller et købssignal, der skal gribes). Sjældent og kort.
  Routeren vurderer løbende, ca. **hver 6. ord** kunden siger, fordi den er hurtig og billig.
- **Fyld og tænkelyde** («mm», «ja-ja», «øhm, lad mig lige se…») er forudindspillet i Adrians stemme og
  afspilles straks, mens svaret skrives. Claude må skrive «øh», «altså» og tags som `[sighs]`, `[laughs]`.

## 4c. Router før Claude (ca. 70–300 ms)
En lille, hurtig model vælger fra en fast menu på kundens foreløbige tekst, mens kunden taler:
`vil_hoere_mere`, `indvending`, `forkert_antagelse`, `koebssignal`, `spoergsmaal`, `tilbagekald`,
`nyt_nummer`, `robinson`, `spoerger_om_ai`, `afvisning`, `backchannel`, `taler_for_meget`, `andet`
(`ROUTER_LABELS`). Claude får valget med og ved så, om
den skal uddybe, håndtere indvendingen eller gå i lukning med det samme. Kendte indvendinger kan
afspille et forudindspillet svar uden Claude.

**Routeren er Jev (TypeSafe AI), besluttet af Ernesto 14/10.** Jev er en «System One»-beslutningsmodel:
den skriver ikke tekst, men returnerer typede beslutninger på ca. 70–500 ms til ca. $0,042 pr. million
input-tokens (output gratis). Det passer præcist til routeren:
- **Choice:** kundens tur → én label fra menuen ovenfor (`ROUTER_LABELS` i `lib/ai-saelger/router.ts`).
- **Noul (ja/nej med sandsynlighed):** «skal Adrian bryde ind nu?», kaldt ca. hver 6. ord.
- **Score:** kundens interesse (0–1) til at vælge mellem uddyb og lukning.
Forbehold: Jev er i early access (september 2026), kontekst 32K, kun tekst. Endpoint og SDK
(`@typesafe-ai/sdk`, `api.typesafe.ai`) bekræftes mod TypeSafes egne docs, og dansk testes på rigtige
kundecitater fra jeres samtaler, før den bruges live. Claude Haiku er reserve.

**Bekræftet 14/10 (TypeSafes eget SDK, `@typesafe-ai/sdk` 0.6.0):** ét endpoint,
`POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer $TYPESAFE_API_KEY`, body
`{ model, state, questions }`. Spørgsmål: `choice` (`criteria`: label → beskrivelse; svar `choice`,
`confidence`, `probabilities`), `noul` (`criteria.true/false`; svar `noul` = sandsynlighed for ja) og `score`;
flere i samme kald. Modeller: `jev-latest` (standard) og `jev-preview`. Kode: `lib/ai-saelger/router-jev.ts`.
Måling mod Haiku: `scripts/ai-saelger-router-eval.ts --cases <citater.json>`; citaterne ligger ikke i repoet.

**Måling 14/10 (116 rigtige kundecitater, uden navne, Ernestos ja til TypeSafe):** citaterne er fra
produktionsdatabasen: kundens citat pr. indvendingskategori i `CallAnalysis.result->objections` og
kundesegmenter i `CallTranscript.segments` (tidsforslag, spørgsmål, korte svar, tilbagekald, Robinson,
forkerte antagelser, lange monologer), hver med sælgerens replik lige før. Label + forsvarlige
alternativer (`ok`) er sat i hånden.

| Jev (`jev-latest`), to kørsler | præcis label | forsvarlig label | korte svar (≤ 3 ord), forsvarlig | p50 / p90 |
|---|---|---|---|---|
| kun kundens tur | 70–72 % | 91–92 % | 91 % | 128–151 / 148–177 ms |
| med Adrians sidste replik (`sidsteAgentReplik`) | 71–72 % | **94–95 %** | **100 %** | 129–155 / 156–184 ms |

- **Sidste replik med (a):** hjælper og koster ca. 1–4 ms. Købssignal 82 → 91 % forsvarlig («Mandag
  klokken 13:30.» efter «Så på mandag klokken 13:30?» rammes nu), korte svar 91 → 100 %; ingen replik
  blev forkert af det. Spørgsmål er 100 % forsvarlig i begge; «vil høre mere» kaldes næsten altid
  `spoergsmaal` (forsvarligt). Tilbage: «jeg vil tænke over det» → `tilbagekald` (bør være indvending).
- **Noul ved turslut (b)** (17 med facit ja, 99 nej; med sidste replik): 0,5 fanger 7–8/17 med 1 % falske;
  **0,3 fanger 15–16/17 med 8–10 % falske**; 0,3 ELLER Choice giver det samme; **0,3 OG Choice fanger
  12–13/17 med 2 % falske**. AUC 0,96.
- **Live, hver 6. ord** (86 replikker, 347 trin, Choice + Noul i ét kald, p50 128 ms): Noul ≥ 0,3 alene fanger
  15/16, men bryder falsk ind i 20 % af replikkerne undervejs (0,3 ELLER Choice: 24 %). **Noul ≥ 0,3 OG
  Choice fanger 12/16, typisk efter 6–12 ord, med 4 % falske.** De fire, den misser, er lange monologer
  (`taler_for_meget`), som først kan genkendes på længden.
- Jev svarer ikke helt ens fra kørsel til kørsel (±2 citater), og ét kald ud af ca. 1.000 gik over
  timeouten på 3 sek. Routeren skal derfor altid have en reserve (Haiku eller «ingen beslutning»).
- **Haiku (`claude-haiku-5-5`) er ikke målt endnu:** `ANTHROPIC_API_KEY` når ikke Claude Code-cloudmiljøet
  (navnet er reserveret), så nøglen skal ligge som `ALLIO_ANTHROPIC_API_KEY`; klienten læser begge.
- **Anbefaling:** Jev som router, altid med Adrians sidste replik (Choice + Noul i ét kald, ca. 130 ms).
  Mens kunden taler (hver 6. ord): **bryd ind, når Noul ≥ 0,3 OG Choice er `forkert_antagelse` eller
  `taler_for_meget`**; et falsk indbrud er det dyreste, Adrian kan gøre. `taler_for_meget` afgøres
  desuden på længde (fx over ca. 60 ord uden spørgsmål), ikke kun af modellen. Ved turslut bruges Choice
  til at vælge svaret. Haiku er reserve ved timeout/fejl; den endelige sammenligning laves, når Haiku er
  målt på de samme 116 citater.

## 4d. Læring
- **Opstart på sælgerdata (én gang):** kun lange samtaler med interesse og `CallAnalysis.overallScore`
  over 60. Herfra: stærke svar pr. indvending, åbninger og lukninger der virkede, og eksempelsamtaler
  i den store, cachede systemprompt.
- **Derefter kun egne data:** Adrians opkald analyseres af workeren som alle andre. Jævnligt laves en ny
  version af «Adrians playbook» med evidens fra hans egne samtaler (hvad virkede, hvad gav nej), med
  versioner og tilbagerulning. Ingen ny sælgerdata.
- **Stemme:** ElevenLabs-klon af Ernestos stemme fra hans egne optagelser (venstre kanal i stereo-
  optagelserne siden 26/9, inkl. de 54 nye), testet mod færdige stemmer i lyttetesten.
- **Træning før rigtige opkald:** Adrian øver mod en simuleret kunde (Claude spiller kunden ud fra rigtige
  kundecitater og indvendinger), og en dommer scorer samtalen. Bygger på «Øv indvendinger».

## 5. Jura og tillid (skal afklares før rigtige opkald)
- **Markedsføringsloven § 10 (Ernesto, 13/10):** SMS'er sendes efter § 10, stk. 2, med frameldingslink.
  Ernesto har tilladelse til at ringe ud med AI til alle på sin liste. Afgjort.
- **AI (Ernesto, 13/10):** Adrian nævner ikke selv, at han er en AI. Spørger kunden direkte, benægter han
  det ikke: han vedgår det kort, lidt stødt, og skubber det væk («det ændrer ikke på, hvad jeg ringer om»)
  og går tilbage til budskabet. Han lyver aldrig om det. Ernesto er gjort opmærksom på AI-forordningens
  art. 50 (gælder fra 2/8-2026) og bærer selv den vurdering.
- **Optagelse og data:** samme samtykke og opbevaring som i dag. Lyden går til Soniox og
  tekst-til-tale-udbyderen og gemmes ikke hos dem.
- **Robinson-listen og frabedt kontakt** respekteres som i dag.

## 6. Pris (overslag pr. samtaletime)
| Del | Ca. |
|---|---|
| Telnyx-minutter | som i dag |
| Soniox realtime, 1 spor (kunden) | $0,12 |
| Claude Haiku | $0,25–0,75 |
| Tekst til tale, dansk | afhænger af udbyder (skal måles) |

Månedsloft og automatisk stop som i workeren og coachen (`LIVE_COACH_MONTHLY_BUDGET_USD`-mønstret).

## 7. Hvor i systemet det bygges
Bygges videre fra branchen **`scripts-og-traening`** (eller en under-branch, fx `ai-saelger`), fordi
al genbrugt kode (live-coach, analyse, ugens script, booking) ligger dér.

| Ny del | Placering |
|---|---|
| Agentens logik: prompt, værktøjer, samtaletilstand | `lib/ai-saelger/` (ny) |
| Stemmeagent-server (WebSocket fra Telnyx, Soniox, Claude, tekst til tale) | `scripts/ai-saelger-server.ts` (ny, kører på VPS'en) |
| Start/stop på en kampagne, status | `app/api/ai-saelger/` (ny) |
| Administrationsvisning: aktive samtaler, udfald, pris, lyt med | `app/(dashboard)/scripts-og-traening/ai-saelger/` (ny) |
| Fælles booking-funktion | flyttes fra `app/api/meetings/book/route.ts` til `lib/booking/` |
| Opkald, AMD og viderestilling | genbrug `lib/dialer-bridge.ts` og `app/api/dialer/dispatch/route.ts` |
| Log | ny tabel `AiCallEvent` (migration kun på testbranchen først) |
| Delt med coachen | `lib/live-coach/` (prompt, svarbank, triggers, kundekontekst) |

## 8. Faser (alt i testmiljøet først)
| Fase | Indhold | Færdig når |
|---|---|---|
| 0 | Prototype: ring til dig selv, AI fører en samtale efter scriptet. Mål latens med begge veje fra afsnit 4 | under ca. 1 sek. pr. tur (median) |
| 1 | Værktøjer: ledige tider, book møde (testkalender), udfald, tilbagekald | et testmøde bookes ende til ende |
| 2 | Kobling til kampagner, AI-bruger, log, administrationsvisning, månedsloft | en testkampagne kører med 5–10 opkald til interne numre |
| 3 | Jura afklaret (afsnit 5). Lille pilot på rigtige leads med en sælger klar til viderestilling | bookingrate og kundereaktioner vurderet af Ernesto |
| 4 | Udrulning | Ernestos godkendelse |

## 9. Åbne spørgsmål til Ernesto
1. Skal AI'en ringe til alle leads, eller kun til en del (fx genkald, gamle leads, uden for åbningstid)?
2. Må den booke direkte, eller skal en sælger bekræfte mødet bagefter?
3. ~~Navn~~ **Besluttet 13/10: Adrian.** Stemmen vælges ved en lyttetest (se 4).
4. Tekst til tale: vi starter med ElevenLabs. Først en dansk lyttetest (samme replikker med «øh»,
   «altså», «mm» osv.) mod ElevenLabs Flash v2.5, ElevenLabs v3, Cartesia Sonic, Azure HD og Google
   Chirp 3 HD, og evt. en tale-til-tale-model som reference. Vurderes af Ernesto på lyd og latens.
5. ~~Viderestilling~~ **Besluttet 13/10: ingen viderestilling.**

## 10. Systemprompten: Ernestos svar (runde 1, 13/10)
- **Persona:** 26 år, mødebooker. Mandestemme = **Adrian**, kvindestemme = **Katrine** (udtales på dansk).
- **Åbning (Ernestos egen):** «Hej [navn], det er [Adrian] – har du lige to minutter?» → «Jeg skal være
  ærlig med dig: Jeg er mødebooker, og jeg ringer fordi I bruger [bookingsystem]. Men det her er ikke et
  salgsopkald – jeg skal ikke sælge dig noget i telefonen …» → Allio-pitchen (kundernes livstidsværdi,
  50–60 % bliver faste kunder, ca. 40 % inaktive, aldrig inviteret tilbage) → «Må jeg spørge dig, hvor
  længe har I brugt jeres bookingsystem?»
- **Tone:** humor, så kunden kan grine med, og let ironi, hvis kunden kan lide det. 3–4 nej, før han giver op.
- **Beslutningstager:** leadet har navne på mulige beslutningstagere. Siger den, der tager telefonen,
  navnet, er det den rette. Sekretær: hård og kontant, beder ikke om lov, siger ikke hvad det drejer sig
  om, spørger om personen er der nu, et andet nummer, eller hvornår han skal ringe igen.
  Han påstår ikke, at beslutningstageren kender ham eller venter opkaldet.
- **Allio og pris:** han må bruge alt, han ved om Allio. Bookingsystemet er gratis; resten koster samlet
  2.500 kr./md. 2.500 kr. er ikke dyrt i forhold til markedsføring for 6–12.000 kr./md., når udfaldet er
  det samme, og kunden sparer et nyt bookingsystem. Tal tilpasses kunden (fx regnet ud fra kundens eget
  antal kunder), men han opfinder ikke tal, cases eller kunder.
- **Mødet:** inden for 14 dage. Fyldes bagfra: fredag → torsdag (→ ugen efter) → onsdag → tirsdag →
  mandag (mandag/tirsdag kun hvis kunden ikke kan andre dage). Direkte adgang til mødekalenderen.
- **Robinson/reklamebeskyttet:** han beklager straks, siger det må være en fejl, undskylder og ønsker en
  god dag. Kun hvis kunden lyder interesseret, må han fortsætte.
- **Træningsdata:** samtaler på 6 min eller mere med `overallScore` over 60.
- **Noter (til specialisten, der tager ud):** bookingsystem, antal kunder i kartoteket, om prisen blev
  nævnt og reaktionen, hvad de har brugt før, og andet relevant for det fysiske møde.

## 11. Ernestos svar (runde 2, 14/10): stemmer, flow og afbrydelser
- **Stemmefavoritter fra lyttetesten:** Isabella (bedst samlet, v3 / v3 Conversational / v4 Turbo),
  Christian (v3 Conversational, især «bum bum bum»), Camilla, Jonas og Noam (v3), Cartesia Katrine,
  Mette og Søren. Christian på v4 Turbo var dårlig i replik 2. Plus en klon af Ernestos stemme.
- **Tal:** ca. 40 % af kundekartoteket er inaktive; vi genaktiverer 2–12 % (helst 2–5 %), tilpasset så
  det lander på 10–20 genbookinger om måneden for netop den klinik.
- **Sekretær, der spørger ind:** «Det er et anliggende mellem Lars og mig og egentlig ikke dig
  vedkommende. Kan jeg fange ham nu?» Ellers bruges tilbagekaldsværktøjet til det rigtige tidspunkt.
- **Kunden afbryder:** Adrian siger sin halve sætning færdig og svarer, hvis det giver mening. Er det
  noget, der ikke fører mod mødet, må han af og til køre videre. Det skal være en dialog, ikke en monolog.
- **Adrian bryder ind:** når kunden taler for meget, eller har en forkert antagelse om, hvad vi er:
  marketingbureau, skifte deres bookingsystem, få dem til at bruge flere penge, eller «sælgere»
  (vi er mødebookere, ikke sælgere).
- **Tavshed:** vent 3–5 sek. (til det lige bliver lidt akavet), men samtalen må ikke gå i stå.
- **Telefonsvarer:** ingen besked; udfaldet sættes til voicemail.
- **«Send mig en mail»:** betyder, at kunden ikke er interesseret endnu. Adrian kæmper for at tale
  videre eller finder et nyt tidspunkt at tale.
- **Efter booking:** kunden får inden dagen er omme en bekræftelse på SMS og mail. Adrian gentager
  tidspunkt, sted og hvad mødet går ud på. Bruger kunden GeckoBooking, får de en mail, de skal
  videresende til Gecko, så vi kan åbne integrationen før mødet.

## 12. Mål for drift: flere Adrians samtidig og test af hvad der virker
- **8–9 samtidige opkald** i starten, fordelt på ca. **3 tilgange × 3 stemmer** (et eksperiment).
- Hvert opkald logger sin variant (tilgang, stemme, prompt-version) i `AiCallEvent`, og udfaldet
  (møde booket, tilbagekald, nej) kobles på. Administrationsvisningen viser bookingrate pr. variant
  med antal opkald, så vi ikke konkluderer på for få samtaler.
- Fordelingen kan med tiden flytte flere opkald til det, der virker (multi-armed bandit), indtil der
  vælges én tilgang og én stemme, som så kører 8 ad gangen.
- Kapacitet: 8–9 samtidige samtaler = 8–9 Soniox-strømme, 8–9 TTS-strømme og Claude-kald parallelt.
  Telnyx-linjer og Soniox/ElevenLabs-samtidighedsgrænser skal tjekkes mod abonnementerne.

## 13. Beslutninger 14/10 og kernen i koden
- **Stemmer:** 2× Isabella (Katrine; v3 Conversational og v4 Turbo) og 1× Christian (Adrian; v3
  Conversational). Ernestos stemmeklon venter til næste måned. **9 agenter ad gangen** (3 tilgange × 3 stemmer).
- **Booking:** første ledige specialist (næsten altid Victor).
- **Tilbagekald:** til agenten selv; den husker sidste samtale via noterne.
- **Udfald:** de samme som sælgerne (`lib/lead-status.ts`).
- **Mail/SMS:** mail kan sendes gennem Allio Leads i dag; SMS skal bygges, før agenten kan sende den.
  Gecko-skabelonen findes ikke og skal laves.
- **Kode (`lib/ai-saelger/`, med tests):** `agents.ts` (stemmer, tilgange, 9 varianter), `system-prompt.ts`,
  `router.ts` (menu + parser), `turn-taking.ts` (backchannel, halv sætning færdig, brud, tavshed 3–5 sek.),
  `slot-order.ts` (fredag/torsdag først inden for 14 dage), `pitch-numbers.ts` (40 % inaktive, 2–12 %,
  10–20 om måneden), `tools.ts` (værktøjerne til Claude).

## 14. Selvforbedring af playbooks (Ernesto, 14/10)
- **Hver 15. samtale pr. playbook: en gennemgang, ikke en tvungen ændring.** Adrian analyserer de 15
  seneste samtaler (hvad virkede, hvad virkede mindre godt, hvor faldt samtalerne fra, hvilke
  indvendinger kom) og vælger én af tre konklusioner:
  1. **Ændr nu:** tydelig evidens → ny version af playbooken (versioner og tilbagerulning).
  2. **Mere data først:** et mønster, men for få samtaler → noteres som hypotese og testes bevidst
     (inden for de 25 %) i de næste samtaler.
  3. **Kør videre uændret:** det virker godt nok.
  Gennemgangen gemmes med begrundelse, så Ernesto kan se, hvorfor der blev ændret eller ej. Kun hans
  egne samtaler bruges.
- **Udforskning:** i samtalen må Adrian afvige op til ca. 25 % fra playbooken for at prøve nye
  formuleringer og rækkefølger. Analysen markerer, hvad der var nyt, så det, der virker, kommer med i
  næste version.
- Faste regler (systemprompten: pris, binding, AI, Robinson, fysisk møde, tal og cases) ændres ikke af
  selvforbedringen; kun playbooken.
- Observability: egen logning i databasen (`AiCallEvent`, `CallAnalysis`) frem for LangSmith, så
  samtaledata bliver hos os.

## 15. Drift (Ernesto, 14/10)
- Når Adrian virker, tildeles han **bestemte kampagner** og **et tidsrum**, hvor han må ringe på dem.
- Han **booker direkte** i kalenderen uden bekræftelse fra en sælger.
