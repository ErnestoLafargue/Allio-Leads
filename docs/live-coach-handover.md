# Overdragelse: byg live-coachen færdig (Allio Leads)

Til: en Claude-agent i en cloud-session. Branch: `scripts-og-traening` (bygger på `main`).
Læs hele dokumentet, `AGENTS.md` og `docs/scripts-og-traening-rapport.md` før du skriver kode.

## 0. Faste regler (fra ejeren, Ernesto)
1. **Ingen push til `main`, ingen merge, ingen deploy, ingen ændringer i produktionsdatabasen.**
   Arbejd kun på branchen `scripts-og-traening` (eller en under-branch). Ejeren godkender alt til sidst.
2. `vercel.json` på denne branch har `git.deploymentEnabled.scripts-og-traening: false`. Build-scriptet
   (`npm run build`) kører `prisma migrate deploy` mod den database, `DATABASE_URL` peger på —
   **kør aldrig `npm run build` eller `prisma migrate` mod produktion**. Brug kun Neon-test-branchen
   (endpoint `ep-soft-bird-ag74gtoa`), og sæt `BRANCH_GUARD=ep-soft-bird-ag74gtoa` (scripts stopper ellers).
3. Rør ikke ejerens igangværende dialer/presence-filer udover de små, beskrevne indkoblingslinjer
   (afsnit 4), og vis dem som en separat, lille diff.
4. UI og tekster på dansk. Sælgere ser egne samtaler, admins alle.
5. Budget: brug mindst muligt på API'er under test (Soniox ~$0,12/lydtime pr. spor, Claude Haiku ~$0,002 pr. kort). Log forbrug.
6. Next.js 16 (App Router, `params` er Promises) — læs `node_modules/next/dist/docs/` før Next-kode.
   Tests (`npx vitest run`), `npx tsc --noEmit` og `npx eslint <filer>` skal være grønne.

Miljøvariabler, du skal have fra ejeren (aldrig i chatten eller i git): `DATABASE_URL` (Neon-test-branch),
`BRANCH_GUARD`, `AUTH_SECRET`, `SONIOX_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`
(nøglen er org-scoped: headeren `anthropic-workspace-id` sættes i `lib/anthropic-client.ts`), `TELNYX_API_KEY`.

## 1. Hvad der allerede er bygget (kort)
«Scripts & Træning» (se rapporten): Telnyx-optagelser → Soniox-transskription → Claude-analyse med
evidens (citat + tidsstempel) → UI (`/scripts-og-traening/*`), ugens script (auto-udgivet, versioner,
tilbagerulning), træning pr. sælger, worker (`scripts/worker.ts`). Historikken: alle 264 samtaler i
prioritet a er analyseret; prioritet b/c fortsætter senere.

## 2. Live-coachen — mål
Et lille kort i dialeren under opkaldet: **signal** (TRYGHED/KLARHED/ØKONOMI/SKEPSIS/TIMING/LAV INTERESSE),
**3–6 ord** om hvad kunden mangler, og **én replik** at sige. Tilstande SCRIPT → AFVIGELSE → TILBAGE.
Tavs når usikker. **Krav: et kort inden for ~1 sekund efter kundens ord — også før kunden er færdig.**
Ingen GPU: Soniox realtime + Claude Haiku via API (besluttet med ejeren).

## 3. Prototype, der allerede findes (virker i typecheck/lint/tests — IKKE testet med rigtig lyd endnu)
| Fil | Rolle |
|---|---|
| `app/api/live-coach/session/route.ts` | POST: 2 kortlivede Soniox-nøgler (single-use, 60 s, `transcribe_websocket`) + svar på indvendinger fra aktivt ugens script + sælgerens navn. Den rigtige nøgle forlader aldrig serveren. |
| `app/api/live-coach/suggest/route.ts` | POST `{lines, trigger}` → streamer tekst `SIGNAL:/HVORFOR:/REPLIK:` fra Claude Haiku (`claude-haiku-4-5-20251001`, cachet systemprompt). Logger ms + pris i server-log. |
| `lib/live-coach/soniox-stream.ts` | Browser: MediaStream → AudioWorklet → 16 kHz PCM → `wss://stt-rt.soniox.com/transcribe-websocket` (`stt-rt-v5`, endpoint detection 500 ms, `<end>`-tokens). `SpeakerTranscript` holder endelig/foreløbig tekst. |
| `lib/live-coach/triggers.ts` | Lag 1: regex-genkendelse af indvendinger på ufærdig tale → straks-kort med svar fra ugens script (reserve: foretrukne svar). |
| `lib/live-coach/card.ts` / `suggest.ts` | Kortformat + parser (klient-sikker) / prompt + streaming (server). |
| `lib/live-coach/script-responses.ts` | Svarene fra det aktive ugens script. |
| `app/components/live-coach.tsx` | Klientkomponent `<LiveCoach micStream remoteStream active onTranscript? onLatency? />`: to Soniox-strømme (sælger/kunde), lag 1 straks, lag 2 (Claude) ved indvending eller når kunden er færdig. |
| `app/(dashboard)/scripts-og-traening/live-coach/` | Testside: din mikrofon spiller kunden; viser transskription, kort og målt tid (median) for straks-kort og AI-kort. |
| Tests | `lib/live-coach/triggers.test.ts`, `lib/live-coach/soniox-stream.test.ts` |

Latensmåling: `heardAt = streamStart + token.end_ms` (Soniox' tidslinje) → `performance.now() - heardAt`, når kortet vises.

## 4. Næste skridt (i rækkefølge)
1. **Verificér prototypen med rigtig lyd** på testsiden (`/scripts-og-traening/live-coach`, kræver
   `getUserMedia` → https eller localhost). Ret protokolfejl mod Soniox' docs
   (https://soniox.com/docs — WebSocket API, temporary API keys). Mål: straks-kort < 500 ms, AI-kort < 1,5 s (median).
2. **Lag 1 bedre**: udvid regexerne med rigtige formuleringer fra historikken — `CallAnalysis.result.objections[].customer.quote`
   pr. kategori i databasen (hent med Prisma på test-branchen) — og tilføj tests pr. kategori. Overvej en lille
   Haiku-klassifikation af ufærdig tale, hvis regex ikke rækker.
3. **SCRIPT/AFVIGELSE/TILBAGE**: følg sælgerens tale mod ugens script (`SalesScriptVersion` WEEKLY aktiv,
   `content.sections[].lines`) — vis næste scriptlinje i SCRIPT; vis kort i AFVIGELSE; «tilbage til: …» i TILBAGE.
4. **Indkobling i dialeren** (ejerens filer — minimal diff, vis den separat):
   `app/components/campaign-voip-strip.tsx` har `remoteStream` (state, linje ~327) og en vedvarende mikrofon-stream
   (linje ~329–331/792); `app/components/power-dialer-phone.tsx` har `remoteStream` (~172) og mikrofon (~321).
   Monter `<LiveCoach micStream={…} remoteStream={remoteStream} active={opkald i gang && coach slået til} />`
   + en tænd/sluk-knap pr. sælger (gem valget i localStorage). Chrome: en remote WebRTC-stream skal også
   afspilles i et `<audio>`-element for at give lyd i Web Audio (dialeren gør det allerede).
5. **Forbrugslog**: gem pr. kort (ms, tokens, pris) — fx en lille tabel `LiveCoachEvent` (ny migration, kun på
   test-branchen) — og vis median-latens på testsiden.
6. **Robusthed**: genforbind WebSocket ved fejl (ny nøgle via /session), stop streams når opkaldet slutter,
   debounce AI-kald (højst ét i luften; nyt afbryder gammelt — findes), tavshed ved lav sikkerhed.
7. Aflever: kort rapport (hvad, hvordan testet, målte latenser, filer, forbrug, åbne spørgsmål) i
   `docs/live-coach-rapport.md`. Commit på branchen; **ingen merge/deploy**.

## 5. Nyttige kommandoer
```bash
npm ci
npx prisma generate
npx vitest run
npx tsc --noEmit -p tsconfig.json
npx eslint app/components/live-coach.tsx lib/live-coach app/api/live-coach
# dev-server mod test-branchen (DATABASE_URL = Neon-test-branch):
npx next dev -p 3000
```
