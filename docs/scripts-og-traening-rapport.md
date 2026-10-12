# «Scripts & Træning»: rapport (step 3–8 + power-dialer-fix)

Stand 27/9-2026. Alt kører lokalt mod Neon-branchen `scripts-traening-dev` (endpoint `ep-soft-bird-ag74gtoa`).
Intet er committet, pushet eller deployet, og produktionsdatabasen er ikke rørt.

## 1. Hvad er bygget

| Del | Indhold | Resultat på branchen |
|---|---|---|
| Import (step 2, forud) | Telnyx-optagelser kobles til sælger, lead og udfald (`CallRecording`). Dubletter fra power dialeren markeres. | 2.622 optagelser. 804 samtaler på ≥ 15 s. 58 dubletter. |
| 3 Transskribering | Soniox `stt-async-v5` med sælgerens navn og «Allio» som kontekst. Stereo splittes med ffmpeg (venstre = sælger). Mono bruger talerskelnen, og sælgeren findes ud fra «Allio», navn og sælgerfraser. Samtaler uden tale får status `NO_SPEECH`. Lydfil og transskription slettes hos Soniox efter hvert opkald. | 757 transskriberet (738 med tale, 19 uden). 33,6 timer lyd, 0 fejl. |
| 4 Analyse | Prompt og JSON-skema er versioneret kode (v1.1), fælles for sessionen og workeren. Evidensprincippet gælder: hvert fund har et segment og et ordret citat. Koden tjekker citatet og beregner alle scorer (faser, indvendinger, taletid, spørgsmål, monolog). Fund uden gyldigt citat fjernes. Hver analyse gemmes med version og kilde (`session`/`api`). | Guldsæt: 30 samtaler (0 citatfejl). Historikken: se afsnit 5. |
| 5 Menuen | Siderne Overblik, Mine samtaler, Scripts, Træning og Indsigter. I en samtale ser man farvede øjeblikke (grøn = stærkt, gul = kan forbedres, rød = misset) med citat og tidsstempel. Et klik på et citat får lyden til at springe dertil. Desuden faser, indvendinger, kundesignaler og en transskription, der følger lyden. Sælgere ser egne samtaler, admins ser alle. Lyden afspilles i mono (begge parter i begge ører). Lyden kommer fra Blob-kopien eller en ny route, der henter en frisk Telnyx-URL. | Alle sider er testet som admin og som sælger. En sælger får 404 på andres samtaler og lyd. |
| 6 Worker | `scripts/worker.ts` kører i en løkke: afstemning af de seneste 3 dage → Soniox → Claude API (`claude-opus-5`, prompt caching, workspace-header) → ugens script. Svarene streames (op til 32.000 tokens), og prisen logges også, når et kald fejler. Der er månedlige forbrugslofter. Fejl får status `FAILED` og kan køres igen med `--retry-failed`. | Testet på 6 samtaler for $0,55. Session- og API-score ligger inden for ±2 point. |
| 7 Ugens script | En evidenspakke sammenligner bookede møder med nej: faser, indvendinger, signaler, pitch og nøgletal. Ud fra den og Pitch NyNyNy laves et nyt script (prompt w2). Hver ændring har evidens (antal samtaler og eksempler), og den valideres mod pakken. Scriptet udgives automatisk som en ny version, og en admin kan rulle tilbage. Sælgere ser kun links til egne samtaler i evidensen. | v1 bygger på 93 salgssamtaler, v2 (aktiv) på 119. Begge er udgivet automatisk via API'et. Tilbagerulning er testet gennem UI'et: admin kan skifte version frem og tilbage, en sælger afvises. |
| 8 Træning | Pr. sælger: top 3 fokusområder (afstand til de bookede samtaler), faseprofil, egne stærke og svage eksempler, øvelser og indvendinger. Admin kan vælge sælger. | Kører på de analyserede samtaler. |
| Power-dialer-fix | Årsag til den tavse kanal: dispatcheren startede `record_start`, før benene var forbundet. Årsag til dubletterne: både appen og Telnyx' voice profile optog. Rettelsen: appen optager kun selv, hvis `TELNYX_APP_RECORDING=on` (standard: fra), og aldrig før bridge. Voice profilen optager alle opkald i stereo. | Rettet lokalt. Ikke prøvet med et rigtigt power-dialer-opkald. |
| Deploy-hjælp | `scripts/copy-scripts-traening-data.ts` kopierer optagelser, transskriptioner, analyser og scriptversioner fra branchen til produktion. Så skal intet transskriberes eller analyseres (og betales) igen. Scriptet laver en tørkørsel som standard og kræver, at målet bekræftes. | Tørkørsel testet. |

## 2. Sådan tester du lokalt

1. Start dev-serveren mod branchen i Cursors terminal. Der kan kun køre én dev-server ad gangen i mappen.
   ```bash
   cd /root/Allio-Leads && set -a && . ./.env.local && . ./.env.branch && set +a && npm run dev:remote
   ```
   `.env.branch` skal indlæses efter `.env.local`. Så overskriver den `DATABASE_URL` og peger på `ep-soft-bird-ag74gtoa`. Uden den kører serveren mod produktionen, hvor de nye tabeller ikke findes endnu.
2. Cursor sender port 3000 videre. Åbn `http://localhost:3000/scripts-og-traening` og log ind som normalt.
3. Tests, typecheck og lint: `npx vitest run`, `npx tsc --noEmit -p tsconfig.json` og `npx eslint <filer>`.
4. En enkelt worker-runde: `set -a; . ./.env.local; . ./.env.branch; set +a; npx tsx --tsconfig tsconfig.json scripts/worker.ts --once --analyze-limit 1` (ca. $0,02–0,17 pr. samtale).
5. Tilbagerulning: Scripts → Versioner → «Gør aktiv igen» (kun admin).

Kør aldrig `npm run build` lokalt med `.env.local`. Build-scriptet kører `prisma migrate deploy` mod den database, `DATABASE_URL` peger på, og i `.env.local` er det produktion.

## 3. Nye og ændrede filer

**Nye**
- UI: `app/(dashboard)/scripts-og-traening/` med layout, Overblik, `samtaler/`, `samtaler/[id]/`, `scripts/` (inkl. `actions.ts`), `traening/`, `indsigter/` og `_components/` (`call-review.tsx`, `section-tabs.tsx`, `ui.tsx`).
- API: `app/api/call-recordings/[id]/audio/route.ts`.
- Import og deploy: `lib/call-recording-import.ts`, `lib/call-recording-linking.ts` (+ test), `lib/call-recording-copy.ts` (+ test), `lib/db-guard.ts`.
- Transskribering: `lib/call-transcription/` (`soniox.ts`, `audio.ts`, `segments.ts` + test, `transcribe-call.ts`).
- Analyse: `lib/call-analysis/` (`schema.ts`, `prompt.ts`, `validate.ts`, `score.ts`, `store.ts`, `api.ts`, `analysis.test.ts`) og `lib/anthropic-client.ts`.
- Ugens script: `lib/sales-scripts/` (`schema.ts`, `evidence.ts`, `prompt.ts`, `publish.ts` + test, `generate.ts`).
- Træning og indsigter: `lib/scripts-traening/` (`labels.ts`, `insights.ts`, `analyzed-calls.ts`, `queries.ts`).
- Afspilning: `lib/mono-playback.ts`.
- Scripts: `scripts/import-call-recordings.ts`, `transcribe-calls.ts`, `export-analysis-batch.ts`, `import-analyses.ts`, `weekly-script.ts`, `seed-sales-scripts.ts`, `worker.ts`, `copy-scripts-traening-data.ts`.
- Migrationer: `prisma/migrations/20260926230000_call_recordings/` og `20260927010000_call_transcripts_analyses/`.
- Docs: `docs/salgsscripts/` (dine 5 scripts ordret + README), `docs/scripts-og-traening-goal.md` og denne rapport.

**Ændrede**
- `app/components/app-sidebar.tsx`: menugruppen «Scripts & Træning».
- `app/components/lead-recording-player.tsx`: afspilning i mono.
- Power-dialer-fixet: `app/api/telnyx/webhooks/call-events/route.ts`, `lib/dialer-bridge.ts`, `lib/power-dialer-engine.ts` og `lib/telnyx-call-control.ts`.
- `lib/telnyx-provision-agents-server.ts`: `buildConnectionName` eksporteres nu.
- `package.json` og `package-lock.json`: `@anthropic-ai/sdk` og `zod`.
- `prisma/schema.prisma`: de 4 nye modeller og back-relations på User, Lead og Campaign.

**Kun lokalt, skal ikke committes:** `.mcp.json` (Telnyx-MCP), `.claude/settings.local.json` og `.env.branch` (gitignored).

**Ikke rørt:** dine igangværende dialer/presence-ændringer. `prisma/schema.prisma` indeholder både dine felter (`ringSeconds`, `talkLineSeconds`, `linePhase`, `lineLastSeenAt`) og mine modeller. Dine felter er allerede kørt i produktion via `20260924120000_dialer_line_occupancy`, men den migrationsmappe er ikke committet endnu.

## 4. Migrationer

- `20260926230000_call_recordings`: tabellen `CallRecording`.
- `20260927010000_call_transcripts_analyses`: tabellerne `CallTranscript`, `CallAnalysis` og `SalesScriptVersion`.

Begge er kun kørt på branchen. De tilføjer kun nye tabeller med fremmednøgler (`ON DELETE SET NULL` eller `CASCADE`) og ændrer ingen eksisterende tabeller. Der findes en ældre drift i databasen (et omdøbt indeks på Lead), som bevidst ikke er taget med.

## 5. Forbrug og dækning

- **Soniox:** $3,52 af $5. Det dækker 33,6 timer lyd til $0,10/time plus ASR-testen. Prisen pr. samtale står i `CallTranscript.costUsd`.
- **Claude API:** ca. $2,42 af $5. Beløbet fordeler sig sådan:
  - 6 samtaler (af max 20): $0,55. Prisen pr. samtale står i `CallAnalysis.costUsd`.
  - Ugens script v1: $0,32. v2: $0,55. Prisen står i `SalesScriptVersion.costUsd`.
  - To mislykkede forsøg på v2: ca. $1,00 (anslået). Svaret blev afskåret ved 16.000 tokens. Det er nu rettet med streaming og et højere loft, og prisen på fejlede kald logges fremover.
- **Pro-kvoten (sessionen):** guldsættet (Opus) og historikken (Sonnet) er lavet af sub-agenter. De står med kilden `session` og $0 i databasen.
- **Dækning af historikken:** ‹opdateres›.
- **Forventet drift:** Soniox under $1/md. (ca. 8 timer lyd). Claude koster ca. $0,02–0,17 pr. samtale, så ~160 samtaler/md. giver ca. $10–15/md.

## 6. Åbne spørgsmål

1. **Budget for workeren.** `CLAUDE_MONTHLY_BUDGET_USD=5` rækker til ca. 50 samtaler/md. Muligheder: hæv loftet til ca. $15, brug Batch API (halv pris, svar inden for timer) eller Sonnet til korte samtaler.
2. **Indgående opkald.** Kanalfordelingen er antaget (højre = sælger), men ikke verificeret. Det kræver et test-opkald ind til et Allio-nummer.
3. **Opbevaring af lyd.** Telnyx gemmer lyd i 1 år. Skal lyden kopieres til Blob, så ældre samtaler stadig kan afspilles? Transskriptioner og analyser bliver under alle omstændigheder.
4. **Blandede modeller i historikken.** Guldsættet er lavet med Opus (v1), resten med Sonnet (v1.1), og nye samtaler analyseres med Opus 5 via API. Vigtige samtaler kan analyseres igen via API senere.
5. **Live-coach.** Kræver realtids-STT (Soniox `stt-rt-v5`, $0,12/time) og mere plads end den delte VPS med 8 GB.
6. **Drift af workeren.** Den køres manuelt nu. På sigt kan den køre under pm2 eller systemd; det bestemmer du.
7. **Power dialeren.** Bekræft ved næste brug, at hvert opkald giver præcis én stereo-optagelse med begge parter.
8. **Ugens script.** Det bygger på få bookede møder, så det er et første bud. Det bliver skarpere, efterhånden som flere samtaler analyseres.

## 7. Hvad skal ud ved deploy (kun når du har godkendt)

1. **Commit.** Commit filerne fra afsnit 3 (ikke dem, der kun er lokale). Commit også din `20260924120000_dialer_line_occupancy`-mappe, fordi `schema.prisma` indeholder dine felter.
2. **Push.** Vercel bygger og kører `prisma migrate deploy`, som kører de 2 nye migrationer på produktion. Der skal ikke sættes nye env-variabler på Vercel (`TELNYX_API_KEY` findes). Lad `TELNYX_APP_RECORDING` være usat.
3. **Kopiér data fra branchen.** Gør det før workeren startes. Kør først en tørkørsel:
   ```bash
   set -a; . ./.env.local; . ./.env.branch; set +a
   TARGET_DATABASE_URL='<produktion>' npx tsx --tsconfig tsconfig.json scripts/copy-scripts-traening-data.ts --target-host <prod-host>
   ```
   Tjek tallene, og kør så igen med `--apply`.
4. **Start workeren på VPS'en mod produktion.** Den skal bruge disse env-variabler:
   - `DATABASE_URL` (produktion)
   - `BRANCH_GUARD` sat til produktionens endpoint-id (en bevidst sikkerhedslås)
   - `TELNYX_API_KEY`, `SONIOX_API_KEY`, `ANTHROPIC_API_KEY` og `ANTHROPIC_WORKSPACE_ID`
   - `CLAUDE_MONTHLY_BUDGET_USD` og `SONIOX_MONTHLY_BUDGET_USD`

   Start den med `npx tsx --tsconfig tsconfig.json scripts/worker.ts`. Den kører hvert 5. minut.
5. **Oprydning.** Når produktion er tjekket, kan Neon-branchen `scripts-traening-dev` slettes. Det kræver din ok.
