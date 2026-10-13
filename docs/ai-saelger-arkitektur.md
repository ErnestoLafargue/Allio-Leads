# AI-sælger: arkitektur og hvor den bygges

13/10-2026. **Status: forslag, ikke besluttet.**
I repoet står kun, at «AI-sælgere, der ringer ud» kommer senere (`docs/scripts-og-traening-goal.md`).
Der findes ingen tidligere nedskrevet plan i koden. Ligger der noter et andet sted (fx `allio-backlog`
på VPS'en), skal de flettes ind her. Dette dokument bygger på det, der allerede er bygget og målt.

## 1. Hvad den skal kunne
En AI-mødebooker, der selv ringer leads op fra en kampagne, fører samtalen efter ugens script og
**booker mødet direkte i kalenderen**, ligesom en sælger gør i dag. Målet er det samme: et ja til et
møde (45–75 min) med en Allio-specialist. Den sælger ikke produktet i telefonen.

Kan den ikke klare samtalen, sender den kunden videre til en ledig menneskelig sælger. Den kan også
aftale et tilbagekald eller afslutte pænt.

## 2. Hvad vi allerede har, som den bygger på
| Behov | Findes i dag | Fil |
|---|---|---|
| Ringe ud server-side med telefonsvarer-genkendelse (AMD) | Power/predictive dialer via Telnyx Call Control | `app/api/dialer/dispatch/route.ts`, `lib/dialer-bridge.ts` (`handleAmdHuman`, `handleAmdMachine`) |
| Viderestille til en ledig sælger | Bridge til sælgerens WebRTC-leg | `lib/dialer-bridge.ts` (`reserveReadyAgent`, `originateBridgeToAgent`), `AgentSession` |
| Kø og kampagner | Dialerkø sorteret efter kontaktforsøg | `DialerQueueItem`, `Campaign`, `Lead` |
| Tale til tekst i realtid | Soniox realtime, målt ca. 0,56 sek. | `lib/live-coach/soniox-stream.ts` |
| Hvad skal der siges | Ugens script, svarbank pr. indvending, kundekontekst | `lib/live-coach/script-responses.ts`, `customer-context.ts`, `triggers.ts`, `SalesScriptVersion` |
| Hurtigt svar fra Claude | Haiku med cachet systemprompt, målt ca. 1,1 sek. | `lib/live-coach/suggest.ts` |
| Ledige tider og booking | Mødetider, overlap-tjek, Cal.eu og Podio | `lib/booking/meeting-slots.ts`, `app/api/meetings/book/route.ts`, `lib/booking/post-booking-sync.ts` |
| Udfald | Udfaldslog (fx MEETING_BOOKED) | `LeadOutcomeLog` |
| Optagelse og efteranalyse | Telnyx-optagelse → transskription → analyse → ugens script | `scripts/worker.ts`, `CallRecording`, `CallTranscript`, `CallAnalysis` |
| Log af AI-forbrug og latens | Pr. kort | `LiveCoachEvent`, `lib/live-coach/events.ts` |

Live-coachen er altså halvdelen af en AI-sælger. Den lytter, forstår og foreslår repliken. Det, der
mangler, er at **sige** repliken selv (tekst til tale), styre selve opkaldet og handle (booke, viderestille).

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
   │               viderestil_til_saelger → reserveReadyAgent + bridge (lib/dialer-bridge.ts)
   │               afslut_samtale
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
- **Samme hjerne som coachen.** Prompt, svarbank og indvendingsgenkendelse deles med live-coachen.
  Bliver ugens script bedre, bliver begge bedre.
- **Booking går gennem samme kode som mennesker.** Overlap-tjek, Cal.eu og Podio skal ikke
  genimplementeres. Flyt logikken fra `app/api/meetings/book/route.ts` ud i en funktion i `lib/booking/`,
  som både routen og agenten kalder.
- **Viderestilling er sikkerhedsnettet.** Usikker, vred kunde, eller kunden beder om et menneske:
  viderestil til en ledig sælger med den eksisterende bridge. Ellers et tilbagekald.

## 4. Latens: det sværeste
En naturlig telefonsamtale tåler ca. 1 sekunds pause. Målt i dag (live-coach, fase 0):
Soniox ca. 0,56 sek. + Claude Haiku ca. 1,1 sek. Med tekst til tale (anslået 0,2–0,4 sek.) bliver det ca.
**1,9–2 sek. pr. tur**. Det er for langsomt. Forslag:
1. Start Claude på foreløbig tekst, før kunden er helt færdig (coachens lag 1 gør det allerede).
2. Forudindspil faste replikker: åbning, svarene på de kendte indvendinger, bekræftelse. Lag 1 kan
   afspille dem straks uden Claude.
3. Stream hele vejen: Claudes første sætning går til tekst til tale, mens resten skrives.
4. Mindre lydpakker til Soniox (40 ms i stedet for 100 ms), som foreslået i live-coach-rapporten.
5. Alternativt: en færdig stemmeplatform (fx Telnyx' egne AI-assistenter eller en tale-til-tale-model)
   med vores værktøjer koblet på. Det er hurtigere at bygge, men giver mindre kontrol. Begge veje
   bør prøves af i fase 0.

## 5. Jura og tillid (skal afklares før rigtige opkald)
- **Markedsføringsloven § 10 (Ernestos linje, 13/10):** vi sender SMS'er efter § 10, stk. 2, fordi
  kunden altid kan frabede sig flere med linket i beskeden. Det er den model, Allio kører på i dag.
  Note: § 10, stk. 2, handler om elektronisk post (mail/SMS) til eksisterende kunder. Et opkald fra
  Adrian kan blive set som et *automatiseret opkaldssystem* efter § 10, stk. 1, og det er en anden
  regel. Det bør en jurist kigge på, før fase 3 (rigtige leads).
- **EU's AI-forordning, art. 50 (gennemsigtighed, gælder fra 2/8-2026):** kunden skal vide, at de taler
  med en AI, medmindre det er åbenlyst. Åbningen siger det kort, fx «Det er Adrian, Allios AI-assistent».
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
| 1 | Værktøjer: ledige tider, book møde (testkalender), udfald, tilbagekald, viderestil | et testmøde bookes ende til ende |
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
5. Hvor mange sælgere skal være klar til viderestilling, mens den kører?
