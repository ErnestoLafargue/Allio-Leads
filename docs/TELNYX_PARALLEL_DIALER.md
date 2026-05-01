# Parallel Power Dialer / Predictive — Telnyx-konfiguration

Dette dokument beskriver hvordan parallel-dialer'en (3-10+ agenter samtidigt med 9-30 numre i luften) er sat op, og hvad der skal være på plads i Telnyx-portalen for at det virker i produktion.

## Arkitektur i én sætning

> Server-side dispatcher placerer parallelle udgående opkald med AMD; når AMD detekterer et menneske, originate'r serveren et nyt opkald til en ledig agents personlige SIP-URI med `link_to`, hvorefter Telnyx auto-bridger samtalen.

```
Lead-numre  ──(parallel dial m. AMD)──►  Telnyx  ──webhooks──►  Allio-server
                                            │
                                            │ (AMD = human)
                                            ▼
                                  reservér ledig agent
                                            │
                                            ▼
        Allio-server  ──(originate sip:agentX@sip.telnyx.com  +  link_to)──►  Telnyx
                                            │
                                            ▼
                              Telnyx bridger lead ↔ agent automatisk
```

## Premium AMD (konto / fakturering)

- **Aktivering:** Der er som udgangspunkt **ikke** en enkelt «tænd for premium AMD»-knap på kontoen. Hvert udgående opkald sættes med `answering_machine_detection: "premium"` i `POST /v2/calls` (allerede i vores dispatch).
- **Omkostning:** Telnyx fakturerer premium-AMD (og evt. relateret analyse) efter faktisk brug — tjek [Telnyx-priser](https://telnyx.com/pricing) og kontoopgørelse.
- **Pacing i Allio:** Predictive justerer parallelitet mod **~3 % abandon-rate** (ingen ledig agent da lead blev human) i et rullende 1h-vindue; se `lib/dialer-pacing.ts` og admin-siden **Dialer**.

## Krav i Telnyx-portalen

1. **Voice API (Call Control) Application**
   - Genfindes som `TELNYX_CONNECTION_ID` i Vercel.
   - **Webhook URL**: `https://<din-domain>/api/telnyx/webhooks/call-events`
   - **Failover URL**: kan sættes til samme endpoint (idempotent håndtering).
   - **API version**: API v2.

2. **Outbound Voice Profile**
   - Mindst én skal eksistere — bruges automatisk ved per-agent provisioning så agenternes SIP-konti kan udgå til PSTN ved bridge.

3. **Numre tildelt Voice API Application**
   - Alle numre i `TELNYX_FROM_NUMBERS` skal være tilknyttet ovennævnte Call Control Application (ikke en SIP Connection).

4. **Per-agent Telephony Credentials** *(automatisk via admin-panelet)*
   - Hver bruger med rolle `SELLER` eller `ADMIN` skal have sin egen credential.
   - Provisioneres med ét klik fra `/administration/telnyx` → "Provisionér alle manglende".

## Vercel-miljøvariabler

| Variabel | Beskrivelse |
|----------|-------------|
| `TELNYX_API_KEY` | Telnyx Bearer-token. |
| `TELNYX_CONNECTION_ID` | Voice API Application id (Call Control). |
| `TELNYX_TELEPHONY_CREDENTIAL_ID` | **Fallback** for agenter der ikke er per-agent provisioneret endnu. Når alle er provisioneret kan dette fjernes. |
| `TELNYX_FROM_NUMBERS` | **Anbefalet** — alle købte udgående numre, kommasepareret (E.164), fx fire numre. Kode fordeler pr. `leadId` + sælger, så I ikke kun bruger én linje. |
| `TELNYX_FROM_NUMBER` | Bruges **kun** hvis `TELNYX_FROM_NUMBERS` er tom = ét CLI til alle. |
| `TELNYX_CALL_WEBHOOK_URL` *(valgfri)* | Override af webhook URL — bruges kun hvis Call Control Application ikke har en korrekt URL sat. |
| `BLOB_READ_WRITE_TOKEN` *(anbefalet)* | Vercel Blob — når den er sat, kopierer `call.recording.saved`-handleren mp3'en fra Telnyx til Blob og opdaterer `LeadActivityEvent.recordingUrl`, så afspilning i **Aktivitet** ikke afhænger af udløbende Telnyx-URL'er. Opret et Blob-lager i Vercel og tilføj token under projektets *Storage*. |

## Databasen

Migration `20260425000000_dialer_multi_agent_parallel` introducerer:

- **`User.telnyxCredentialId` / `telnyxSipUsername`** — per-agent identitet.
- **`AgentSession`** — agentens live status (`ready`/`ringing`/`talking`/`wrap_up`/`offline`) pr. kampagne.
- **`DialerCallLog`** — én række pr. opkalds-leg, opdateres af webhook'en.
- **`DialerQueueItem`** — soft-lock på leads under dispatch så samme lead ikke ringes op af to dispatchere.

## Dispatcher-pacing

| Mode | Pacing-ratio | Forklaring |
|------|--------------|------------|
| `POWER_DIALER` | 1.0 | Fast — højst ét udgående lead-leg i luften pr. klar provisioneret agent (mål: ingen over-dial). |
| `PREDICTIVE` | 1.0–3.0 (dynamisk) | Justeres mod ~3 % abandon; se `lib/dialer-pacing.ts`. Indtil der er mindst **25** afsluttede hændelser (bridge + `no_agent_available`) i det rullende 1h-vindue, holdes ratio på **2.0** (varm op uden voldsomme sving). |
| `MAX_IN_FLIGHT_PER_CAMPAIGN` | 50 | Hard cap uanset antal agenter (justerbar i `app/api/dialer/dispatch/route.ts`). |

`POST /api/dialer/dispatch` returnerer altid et **`pacing`-objekt** (bl.a. `ratio`, `bridges1h`, `noAgentAbandons1h`, `heldLowSample`, `minSampleBeforeTune`) så klienter og logs kan korrelere beslutningen.

Dispatcheren kaldes af klienten ved hver heartbeat (5 sek), men kun når agenten er `ready` og auto-dial ikke er pauset. Dispatcher-kaldet er idempotent og placerer kun nye opkald hvis pacing-budgettet tillader det.

## Optagelser (Call Recording)

Hver bridged samtale optages som mp3 (dual-channel: agent venstre, lead højre). Det giver:
- Træningsmateriale til sælgerne (spil tilbage, analyser tonefald, pitch).
- Reference ved disputes og kvalitetssikring.

**Hvornår starter optagelsen?**

| Scenario | Trigger |
|----------|---------|
| Power Dialer / Predictive (server-dispatched) | Når AMD-resultatet er `human_residence` / `human_business` / `unknown` (ikke ved machine/fax). Optagelse starter på lead-leggen og fanger automatisk agentens audio når bridge fuldføres. |
| Click-to-call (WebRTC) | Når `call.answered` modtages med `client_state.kind === "manual"`. Frontenden henter `clientState` fra `/api/telnyx/manual-call/prepare` (pre-fetch + **synkront igen i klik-pathen** hvis ref stadig er tom) så Telnyx kender lead/agent-konteksten. Hvis `client_state` alligevel mangler, startes optagelse kun som **fallback** når From/To matcher præcis ét lead — og aldrig på `DialerCallLog.direction === outbound-lead` (parallel dialer; AMD styrer optagelse). |
| Voicemail / fax | **Aldrig** — `handleAmdMachine` lægger på før optagelse kan starte. |

**Hvor vises optagelserne?**

Når Telnyx fyrer `call.recording.saved` (typisk 2-5 sek efter samtale slutter):
1. Telnyx' mp3-URL gemmes straks i `DialerCallLog.recordingUrl` og i `LeadActivityEvent` (`CALL_RECORDING`) med varighed + agent-navn.
2. I baggrunden (`after()`): hvis `BLOB_READ_WRITE_TOKEN` findes, hentes filen fra Telnyx og lægges i **Vercel Blob**; DB opdateres med den permanente Blob-URL når kopieringen er færdig.
3. I **Aktivitet** vises en afspiller med varighed, **Afspil/Pause** og **slider** til at spole frem og tilbage i optagelsen.

Gentagne `recording.saved`-events (Telnyx retry) opdaterer eksisterende aktivitet i stedet for at oprette duplikater (matchet på `telnyxCallLegId`).

## Voicemail-detektion (AMD)

Hvert udgående opkald fra dispatcheren placeres med `answering_machine_detection: "premium"` og `answering_machine_detection_config` (analysetid, greeting-tærskler). Telnyx svarer med disse webhook-events efter ~1.5–4 sek:

| Event | Resultater | Vores handling |
|-------|------------|----------------|
| `call.machine.premium.detection.ended` | `human_residence`, `human_business` | Reservér ledig agent → originate til agentens SIP-URI med `link_to` → Telnyx auto-bridger. |
| `call.machine.premium.detection.ended` | `machine`, `fax_detected` | **Hangup straks** + marker lead som `VOICEMAIL` i databasen. **Aldrig sendt til en agent.** |
| `call.machine.premium.detection.ended` | `silence`, `not_sure` | Bridge alligevel — agenten beslutter (false negatives koster maks 1-2 sek; false positives mister leads). |
| `call.machine.premium.greeting.ended` | `beep_detected`, `no_beep_detected` | Behandles som `machine` — opkaldet hangup'es. |
| `call.machine.detection.ended` (standard AMD) | `human` / `machine` / `not_sure` | Samme mapping som premium. Bruges hvis dispatcher kaldes med `amd: "detect"`. |

**Garanti**: en agent får aldrig en bridged samtale med en voicemail. AMD kører serverside før noget bridge-flow startes; først ved AMD-result `human*` (eller usikker) reserveres en agent.

Hvis AMD svigter (event mistes, Telnyx-fejl): `timeoutSecs: 25` på lead-leggen sikrer at Telnyx selv hangup'er ubesvarede opkald, og webhook'ens `call.hangup`-handler frigør reservationer.

## Fejlsikring

- **Idempotente webhooks** — `DialerCallLog.rawEventsJson` gemmer event-id'er; duplikater skippes.
- **Soft-lock TTL** — `DialerQueueItem.expiresAt` (90 sek) ryddes op af `DELETE /api/dialer/dispatch` (kan kaldes fra cron).
- **No-agent fallback** — hvis intet ledigt slot kan findes når AMD detekterer human, hangup'es lead-opkaldet og logges som `no_agent_available`.
- **Lead-gone fallback** — hvis lead-leggen er lagt på før AMD-result kan handles, springer vi agent-reservation over.
- **Hangup-cleanup** — agent-session frigøres uanset hvilken leg der dør først.

## Workflow for opstart af en ny agent

1. Admin opretter brugeren i Allio.
2. Admin går til `/administration/telnyx` → klikker "Provisionér alle manglende".
3. Brugeren logger ind, åbner en kampagne via "Start" → workspace sender heartbeats med status `ready`.
4. Når 3+ agenter er `ready` på samme kampagne → dispatcheren begynder at placere parallelle opkald.

## Skalering til 10+ agenter

- Pacing-ratio kan øges (fx 3.5 for større hold).
- `MAX_IN_FLIGHT_PER_CAMPAIGN` kan øges til 100+ hvis Telnyx-kontoen er godkendt til større parallelitet.
- Tilføj flere afsender-numre i `TELNYX_FROM_NUMBERS` for at undgå at samme nummer ringer 30+ leads samtidigt.
