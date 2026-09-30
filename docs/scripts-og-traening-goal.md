# Goal-specifikation: «Scripts & Træning» (step 3–8 + power-dialer-fix)

Live-coach og AI-sælgere, der ringer ud, er IKKE med (kommer senere).

## Mål
Alle opkald bliver transskriberet og analyseret. Sælgeren ser feedback med farver, citater og
tidsstempler. Systemet laver ugens script, og hver sælger får personlig træning.
Den første store analyse af historikken laver Claude selv i sessionen — uden API.
Fremover analyserer en worker nye samtaler via Claude API'et med præcis samme prompt og skema.

## Læs først
- Hukommelsen: scripts-og-traening, allio-business, no-push-no-deploy, allio-backlog, telnyx-mcp-setup.
- AGENTS.md: Next.js-versionen er ny — læs guiden i `node_modules/next/dist/docs/` før Next-kode.
- `docs/salgsscripts/` (5 scripts; Pitch NyNyNy er den nyeste).
- Step 2-koden: `lib/call-recording-import.ts`, `lib/call-recording-linking.ts` (+test),
  `scripts/import-call-recordings.ts`, Prisma-modellen `CallRecording`.
- `/root/allio-asr-eval/RESULTAT.md` (transskriberingstesten).
- claude-api-skillen, før der skrives kode mod Claude API'et.

## Faste regler
1. Ingen git push, ingen commits, ingen deploy, ingen cloud-session og ingen ændringer i produktion —
   heller ikke migrationer eller import mod produktionsdatabasen (et push kan starte et Vercel-build,
   der kører `prisma migrate deploy`). Brug KUN Neon-branchen `scripts-traening-dev` via
   `/root/Allio-Leads/.env.branch` — aldrig `DATABASE_URL` fra `.env.local`. Start dev-serveren med
   `DATABASE_URL` fra `.env.branch` sat i shellen, og tjek at den peger på `ep-soft-bird-ag74gtoa`.
2. Lad brugerens igangværende ændringer i arbejdsmappen være (dialer/presence m.fl.).
3. Installer ingen faste tjenester (systemd/pm2/cron). Workeren køres manuelt under test.
   Det er okay at gennemgå de 6 repos for kode og implementere gode idéer:
   barbararomeira/evidence-scored-call-review, Dphenomenal101/playcall, zime-ai/zime-gtm-skills,
   bunyaminergen/Callytics, m-bain/whisperX, SpeechBrain (call-center analytics).
4. Budget: Soniox højst $5 (allerede indbetalt, rækker til hele historikken). Claude API højst $5
   (eksisterende kredit) — kun til at teste workeren på max 20 samtaler. Køb intet.
   Log forbrug pr. samtale. Stop og spørg, hvis et loft nærmer sig.
5. Kundedata ligger kun på VPS'en og i databasen. Slet filer og transskriptioner hos Soniox efter brug.
6. Tests, typecheck og lint skal være grønne for alle nye og ændrede filer.
7. Kvote: sessionen kører på en Pro-plan (5-timers- og ugegrænser, ekstra forbrug næsten brugt).
   Analysér historikken i prioriteret rækkefølge: (a) alle samtaler med udfald og ≥ 60 s,
   (b) øvrige ≥ 60 s, (c) resten. Hvis kvoten slipper op, stop pænt og fortsæt, når den nulstilles.

## Allerede besluttet
- Transskribering: Soniox `stt-async-v5` (ElevenLabs Scribe v2 som reserve). Giv sælgerens navn +
  "Allio" med i `context.terms`.
- Stereo siden 26/9: venstre = sælger, højre = kunde (udgående). Historikken er mono → brug Soniox'
  talerskelnen og find sælgeren.
- Afspilning i appen er mono (`lead-recording-player.tsx`); filerne forbliver stereo.
- Succes = møde booket (`LeadOutcomeLog` MEETING_BOOKED). Salg måles senere.
- Ugens script udgives automatisk uden godkendelse, men med versioner og tilbagerulning.
- Claude API (workeren): `claude-opus-5` + prompt caching. Nøglen er org-scoped: send headeren
  `anthropic-workspace-id` (`ANTHROPIC_WORKSPACE_ID`) via `defaultHeaders`.
- Nøgler i `.env.local`: TELNYX_API_KEY, SONIOX_API_KEY, ELEVENLABS_API_KEY, ANTHROPIC_API_KEY,
  ANTHROPIC_WORKSPACE_ID.
- Sælgere ser kun egne samtaler; admins ser alle. Alt UI på dansk.

## Plan
### Step 3 – Transskribering
- Modul der henter lyd fra Telnyx, splitter stereo med ffmpeg (hver kanal for sig) eller bruger
  talerskelnen på mono, og gemmer segmenter (taler, start, slut, tekst) i en ny tabel.
- Samtaler uden tale får en egen status og springes over i analysen.
- Kør alle samtaler med status NEW igennem (~800).

### Step 4 – AI-analyse
- Evidensprincip: modellen udtrækker fakta med citat + tidsstempel; koden beregner scorerne.
  Ingen påstand uden citat. Ingen konklusion på for få samtaler.
- Indhold: faser (åbning, kvalificering, behovsafdækning, løsning/social proof, close, bekræftelse)
  med tid; hvilken pitch der blev brugt; indvendinger (de 5 i allio-business + øvrige) og
  håndteringen i forhold til de foretrukne svar; kundesignaler (tryghed, klarhed, økonomi, skepsis,
  timing, lav interesse); stærke/svage øjeblikke og missede muligheder; taletid, spørgsmål, længste
  monolog, close-forsøg, næste skridt.
- Prompt og JSON-skema som versioneret kode, så sessionen og workeren bruger præcis det samme.
  Gem hver analyse med analyseversion og kilde (session/api).
- Guldsæt først: analysér ~30 samtaler, vis brugeren 5 i UI'et, justér — derefter resten af
  historikken i sessionen (i batches via sub-agenter, jf. kvote-reglen). Validér hvert resultat mod skemaet.

### Step 5 – Menuen «Scripts & Træning»
- Overblik, Mine samtaler (transskription med grøn/gul/rød markering; klik på et citat → lyden
  springer dertil), Scripts, Træning, Indsigter. Brug eksisterende design og komponenter.
- Lyd: eksisterende Blob-URL, ellers en ny route der henter en frisk Telnyx-URL.

### Step 6 – Worker til nye samtaler
- TypeScript i samme repo: afstemning (`importCallRecordings` med `fromIso`) → Soniox → analyse via
  Claude API, styret af `pipelineStatus`, med genforsøg og forbrugsloft.
  Testes på max 20 samtaler mod branchen (Claude-budget $5).

### Step 7 – Ugens script
- Bygges ud fra, hvad der adskiller bookede møder fra nej, og det nuværende script. Hver ændring
  har evidens (antal samtaler + eksempler). Udgives automatisk med version og tilbagerulning.

### Step 8 – Træning
- Pr. sælger (primært Ernesto): top 3 fokusområder og egne stærke vs. svage eksempler.

### Til sidst – Power-dialer-fix
- allio-backlog punkt 1: find årsagen til den tavse højre kanal og den dobbelte optagelse, og ret det lokalt.

## Stop og spørg kun hvis
Noget kræver produktion/deploy/push, et budgetloft nås, data skal slettes, eller en beslutning har
stor forretningsmæssig betydning. Ellers: vælg den mest fornuftige løsning og skriv den ned.

## Aflevering
En kort rapport: hvad der er bygget, hvordan det testes lokalt (dev-server mod branchen), liste over
nye/ændrede filer og migrationer, forbrug, åbne spørgsmål — og præcis hvad der skal ud ved det
endelige deploy, som brugeren godkender.
