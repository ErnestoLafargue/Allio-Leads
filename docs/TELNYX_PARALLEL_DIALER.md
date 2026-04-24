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
| `TELNYX_FROM_NUMBER` *eller* `TELNYX_FROM_NUMBERS` | Afsender-nummer(re) i E.164. Komma-separeret hvis flere. |
| `TELNYX_CALL_WEBHOOK_URL` *(valgfri)* | Override af webhook URL — bruges kun hvis Call Control Application ikke har en korrekt URL sat. |

## Databasen

Migration `20260425000000_dialer_multi_agent_parallel` introducerer:

- **`User.telnyxCredentialId` / `telnyxSipUsername`** — per-agent identitet.
- **`AgentSession`** — agentens live status (`ready`/`ringing`/`talking`/`wrap_up`/`offline`) pr. kampagne.
- **`DialerCallLog`** — én række pr. opkalds-leg, opdateres af webhook'en.
- **`DialerQueueItem`** — soft-lock på leads under dispatch så samme lead ikke ringes op af to dispatchere.

## Dispatcher-pacing

| Mode | Pacing-ratio | Forklaring |
|------|--------------|------------|
| `POWER_DIALER` | 1.0 | Sekventielt — næste lead placeres først når forrige er afgjort, men én pr. agent samtidigt. |
| `PREDICTIVE` | 3.0 | 3 numre pr. ledig agent — typisk svarer 1-2 ikke, så dispatcheren rammer ca. 1:1. |
| `MAX_IN_FLIGHT_PER_CAMPAIGN` | 50 | Hard cap uanset antal agenter (justerbar i `app/api/dialer/dispatch/route.ts`). |

Dispatcheren kaldes af klienten ved hver heartbeat (5 sek), men kun når agenten er `ready` og auto-dial ikke er pauset. Dispatcher-kaldet er idempotent og placerer kun nye opkald hvis pacing-budgettet tillader det.

## Optagelser (Call Recording)

Hver bridged samtale optages som mp3 (dual-channel: agent venstre, lead højre). Det giver:
- Træningsmateriale til sælgerne (spil tilbage, analyser tonefald, pitch).
- Reference ved disputes og kvalitetssikring.

**Hvornår starter optagelsen?**

| Scenario | Trigger |
|----------|---------|
| Power Dialer / Predictive (server-dispatched) | Når AMD-resultatet er `human_residence` / `human_business` / `unknown` (ikke ved machine/fax). Optagelse starter på lead-leggen og fanger automatisk agentens audio når bridge fuldføres. |
| Click-to-call (WebRTC) | Når `call.answered` modtages med `client_state.kind === "manual"`. Frontenden pre-fetcher clientState fra `/api/telnyx/manual-call/prepare` så Telnyx kender lead/agent-konteksten. |
| Voicemail / fax | **Aldrig** — `handleAmdMachine` lægger på før optagelse kan starte. |

**Hvor vises optagelserne?**

Når Telnyx fyrer `call.recording.saved` (typisk 2-5 sek efter samtale slutter):
1. URL'en gemmes i `DialerCallLog.recordingUrl`.
2. En `LeadActivityEvent` af kind `CALL_RECORDING` oprettes med URL + varighed + agent-navn.
3. Aktiviteten dukker op i lead-historikken med en HTML5-audio-player (sælgeren kan trykke play direkte i Allio).

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
