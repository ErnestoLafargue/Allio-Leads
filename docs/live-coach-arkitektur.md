# Live-coach: strategi og arkitektur

12/10-2026. Beslutninger truffet (afsnit 9). Fase 0 og 1 er færdige (afsnit 10). Bygges og testes i testmiljøet (Neon-testbranchen + dev-server) før noget deployes.
Byggevejledning til en agent: `docs/live-coach-handover.md`.

## 1. Mål
Sælgeren får den rigtige hjælp i det øjeblik, kunden siger noget — uden at blive forstyrret.
- **Ét lille kort** i dialeren: signal (TRYGHED / KLARHED / ØKONOMI / SKEPSIS / TIMING / LAV INTERESSE),
  3–6 ord om hvad kunden mangler, og **én replik** at sige.
- **Tilstande:**
  - **SCRIPT:** sælgeren følger ugens script, og kortet viser næste linje.
  - **AFVIGELSE:** kunden har brug for noget andet. Kortet viser hjælpen.
  - **TILBAGE:** kortet viser, hvordan sælgeren kommer tilbage til scriptet.
- **Tavs, når den er usikker.** Hellere intet kort end et forkert.

**Succeskriterier**
| Måling | Mål |
|---|---|
| Fra kundens ord til straks-kort (lag 1) | under 0,5 sek. (median) |
| Fra kundens ord til AI-kort (lag 2) | under 1,5 sek. (median) |
| Kort, sælgeren markerer som brugbare | over 70 % |
| Forbrug | under ca. $1 pr. samtaletime |
| Effekt (efter 4–6 uger) | højere bookingrate med coach end uden, målt i de samme samtaleanalyser |

## 2. Brugeroplevelse
- **Koblet til samtalen, ikke til opkaldstypen.** Coachen monteres i den fælles samtalevisning, som sælgeren ser under et opkald. Den får sælgerens mikrofon og opkaldets lydspor fra den aktive Telnyx-samtale. Derfor virker den ens i klik-for-at-ringe, predictive og power dialer.
- **Knappen «Live-coach til/fra»** i dialeren. Valget huskes pr. sælger, og coachen kører kun under opkald.
- **Kortet** ligger fast ved siden af lead-infoen og flytter sig ikke rundt.
  - Lag 1 vises straks.
  - Lag 2 erstatter det, mens teksten strømmer ind ord for ord.
  - Kortet bliver stående, indtil der kommer et nyt.
- **👍 / 👎 på hvert kort.** Det giver data til at forbedre coachen.
- **Efter opkaldet** sker der intet ekstra. Den almindelige analyse (Scripts & Træning) kører som i dag på optagelsen.

## 3. Arkitektur
```
Sælgerens browser (dialer, Telnyx WebRTC)
 ├─ mikrofon (sælger) ──┐
 └─ opkaldets lyd (kunde) ┤  2 × WebSocket, 16 kHz PCM, direkte til Soniox realtime (stt-rt-v5)
                          │  ← kortlivede nøgler fra POST /api/live-coach/session
                          ▼
 Coach-motor i browseren
  ├─ transskription pr. taler (endelige + foreløbige ord, <end> = taleren er færdig)
  ├─ lag 1: genkendelse af indvending på ufærdig tale → svar fra ugens script   (≈ 0,2–0,4 s)
  ├─ script-tracker: hvor i ugens script er sælgeren? → SCRIPT / AFVIGELSE / TILBAGE
  └─ lag 2: POST /api/live-coach/suggest → Claude Haiku streamer kortet          (≈ 0,8–1,5 s)
                          │
 Server (Next.js på Vercel)
  ├─ /api/live-coach/session   nøgler + svarene fra det aktive ugens script
  ├─ /api/live-coach/suggest   Haiku 4.5, cachet systemprompt, ét kort pr. kald
  └─ /api/live-coach/event     logger kort, latens, pris og 👍/👎 (tabellen LiveCoachEvent)
```
**Vigtige valg**
- **Lyden går uden om vores servere.** Browseren sender den direkte til Soniox. Det giver ingen belastning på VPS'en eller Vercel og ingen lydfiler hos os. Optagelsen sker som i dag via Telnyx.
- **Ingen GPU.** Det kører på API'er, der betales pr. brug.
- **Lag 1 er regler og kræver ikke AI.** Det er hurtigt, gratis og forudsigeligt. Lag 2 bruges kun ved en indvending, eller når kunden er færdig med at tale. Der er højst ét AI-kald ad gangen, og et nyt afbryder et gammelt.
- **Samme kilde som resten.** Svarene kommer fra det aktive ugens script, så coachen bliver klogere hver uge uden ekstra arbejde.

## 4. Script-trackeren (SCRIPT / AFVIGELSE / TILBAGE)
1. Ugens script deles i linjer pr. fase: åbning → kvalificering → behovsafdækning → løsning → close → bekræftelse.
2. Sælgerens seneste ytring sammenlignes med de næste linjer (ordoverlap, robust over for småord). Ved et match går trackeren videre: **SCRIPT**.
3. Kunden kommer med en indvending eller et signal: **AFVIGELSE**, og kortet viser hjælpen.
4. Sælgeren har svaret, og kunden er rolig igen: **TILBAGE**, med «Tilbage til: <næste linje>».

## 5. Data og læring
- **Bedre start for lag 1:** genkendelsen bygges på jeres egne 738 analyserede samtaler. Kundens ordrette indvendinger pr. kategori ligger i `CallAnalysis`.
- **Løbende forbedring:** 👍/👎 og latens logges pr. kort. Ugentligt ses de dårligste kort igennem, og regler og prompt justeres. Prompten er versioneret ligesom analysen.
- **Effekt:** samtaler med og uden coach sammenlignes i Indsigter (bookingrate, fasekvalitet, indvendingshåndtering).

## 6. Pris (overslag)
| Del | Pr. samtaletime |
|---|---|
| Soniox realtime, 2 spor | ca. $0,24 |
| Claude Haiku (lag 2) | ca. $0,25–0,75 |
| I alt | ca. $0,5–1 |

Ved 8 samtaletimer om måneden (jeres hidtidige niveau) bliver det ca. $5–10. Ved 4 sælgere på fuld tid bliver det ca. $175–350.

## 7. Risici og værn
- **Forsinkelse eller netværksfejl:** kortet er tavst, og WebSocket genforbindes automatisk med en ny nøgle. Opkaldet påvirkes aldrig.
- **Forkerte kort:** lag 1 kræver tydelige ord, og lag 2 må gerne svare «ingen». 👍/👎 viser hurtigt, hvad der skal rettes.
- **Distraktion:** ét kort ad gangen, ingen lyde og ingen popups.
- **Data:**
  - Kunderne har givet samtykke.
  - Lyden går kun til Soniox, og der gemmes ingen lyd hos os ud over den eksisterende Telnyx-optagelse.
  - Teksten til Claude er de seneste 12 replikker.
- **Omkostninger:** månedligt loft på samme måde som i workeren. Coachen slukker sig selv, når loftet er nået.

## 8. Udrulning (alt i testmiljøet først)
| Fase | Indhold | Færdig når |
|---|---|---|
| 0 | Prototypen testes med rigtig lyd på `/scripts-og-traening/live-coach` | latensmålene i afsnit 1 er nået |
| 1 | Lag 1 bygget på jeres egne indvendinger, LiveCoachEvent og 👍/👎 | tests og målinger er grønne |
| 2 | Script-trackeren og koblingen til dialeren (lille, separat diff i dine dialer-filer) | testopkald til dig selv virker |
| 3 | Ernesto bruger den i rigtige opkald i 1–2 uger | over 70 % 👍 og stabil latens |
| 4 | Alle sælgere og deploy, sammen med resten af Scripts & Træning | din godkendelse |

## 9. Beslutninger (godkendt 12/10)
1. Coachen kobles til samtalevisningen og virker i alle opkaldstyper. Den testes først i den manuelle kampagne-dialer.
2. Coachen er slået fra som standard. Sælgeren tænder den selv.
3. Ernesto tester den alene først (fase 3).
4. Månedsloftet for AI-kort er $25 i testperioden (`LIVE_COACH_MONTHLY_BUDGET_USD`).

## 10. Resultater af fase 0 og 1 (12/10, testmiljøet)
**Fase 0: rigtig lyd.** Målt med `scripts/live-coach-latency.ts`: klip med kundeindvendinger fra rigtige optagelser streames i realtid til Soniox, ligesom browseren gør.
| Måling (median, 5 samtaler) | Resultat | Mål |
|---|---|---|
| Soniox, fra ordet er sagt til teksten er fremme | ca. 0,56 sek. | – |
| Straks-kort efter ordene (lag 1) | **0,54 sek.** (ramte 4 af 5) | under 0,5 sek. |
| AI-replik efter straks-kortet (lag 2) | ca. 1,1 sek. (ca. 1,65 sek. i alt) | under 1,5 sek. |

Der er rettet en fejl i afslutningen af streamen («Request timeout»). Latensen domineres af Soniox. Kandidater til forbedring: mindre lydpakker (40 ms i stedet for 100 ms) og at starte AI-kaldet på det første ord frem for på et færdigt ord.

**Fase 1: data og feedback.**
- **Lag 1 er bygget på jeres egne indvendinger** fra de 738 analyser (måles med `scripts/live-coach-trigger-eval.ts`). Træfsikkerheden steg:
  - pris: 41 % → 98 %
  - send mail: 11 % → 72 %
  - snak med makker: 13 % → 67 %
  - bureau: 0 % → 58 %
  - bookingsystem: 4 % → 47 %
  - fuldt booket: 11 % → 47 %
  - ikke tid: 31 % → 44 %
  - ikke interesseret: 32 % → 38 %
  - dårligt tidspunkt (ny kategori): 0 % → 20 %

  Falske alarmer ligger på 5,6 % af kundereplikker uden registreret indvending. Det er et pessimistisk tal, da mange er reelle omtaler.
- **`LiveCoachEvent`** (ny migration `20261012120000_live_coach_events`, kun kørt på testdatabasen) logger hvert kort: kilde, kategori, signal, replik, latens, pris, promptversion og 👍/👎.
- **`/api/live-coach/event`** gemmer straks-kort, latens og feedback. `/api/live-coach/suggest` logger AI-kort med pris og stopper ved månedsloftet (svarer 429, og coachen er så tavs).
- **Kortet har 👍/👎.** Prompten (`lc1`) giver altid «hvorfor» og en replik på højst 20 ord.
- **Pris:** ca. $0,0018 pr. AI-kort.

**Næste:** fase 2, script-trackeren (SCRIPT, AFVIGELSE og TILBAGE) og indkoblingen i samtalevisningen med en tænd/sluk-knap. Derefter fase 3, hvor Ernesto tester i rigtige opkald.

## 11. Fase 2 (12/10, testmiljøet)
- **Koblet til samtalen, ikke til opkaldstypen.**
  - `lib/live-coach/call-audio.ts` er et fælles register for det aktive opkalds lydspor.
  - `CampaignVoipStrip` (klik-for-at-ringe og predictive) og `PowerDialerPhone` (power dialer) melder sig ind med 1 linje hver, når samtalen er «live».
  - `LiveCoachDock` monteres én gang i dashboard-layoutet. Den vises under ethvert aktivt opkald med knappen «Live-coach: til/fra», som er slået fra som standard og huskes pr. browser.
  - Ændringen i de eksisterende filer er i alt 6 linjer (2 imports, 2 kald og 2 linjer i layoutet).
- **Script-tracker** (`lib/live-coach/script-tracker.ts`):
  - Sælgerens færdige ytringer matches mod de næste 4 linjer i ugens script (28 linjer) med ordoverlap. Bøjninger tælles med, og pladsholdere som «[navn]» ignoreres.
  - Et match giver **SCRIPT** med «Næste i scriptet».
  - Et straks-kort eller AI-kort giver **AFVIGELSE**, og kortet vises.
  - Når sælgeren har svaret, skifter tilstanden til **TILBAGE** med «Tilbage til: …», indtil scriptet rammes igen.
- **Test:** sessionen leverer scriptlinjerne. Arbejdsvisningen, lead-siden og testsiden svarer 200. Unit-tests dækker trackeren.

**Fase 3 (næste):** Ernesto tester i rigtige opkald.
1. Åbn dev-serveren via Cursors port forward.
2. Tænd «Live-coach» og ring til en testkunde eller dig selv.
3. Giv 👍/👎 på kortene.

Målinger: latens og 👍-andel fra `LiveCoachEvent`.
