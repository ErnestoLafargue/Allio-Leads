# Dialer-roadmap (Power Dialer & Predictive)

Dette dokument beskriver de **fire dial-modes** Allio Leads understøtter, hvad der virker i dag, og **arkitekturen** for den næste fase: rigtig parallel/predictive udringning via Telnyx Call Control + AMD.

## Modes — status pr. 2026-04-25

| Mode | Hvad agenten oplever | Implementation |
|---|---|---|
| **NO_DIAL** | Ingen ring-knap, ingen VoIP-strip. Rene noter/data-kampagner. | `campaignUsesVoipUi() === false` |
| **CLICK_TO_CALL** | Manuelt klik på grøn knap → WebRTC-opkald. Agent styrer alt. | Browser → Telnyx Telephony Credential → SIP → PSTN |
| **POWER_DIALER** | Auto-ring straks man åbner næste lead (ingen falsk ventetid). Agent klikker «Gem og næste» → straks næste opkald. | Sekventiel WebRTC. Pause/resume-knap i header. |
| **PREDICTIVE** | Auto-ring + auto-spring videre på terminale udfald (voicemail, ikke interesseret, ukvalificeret) **og** auto-spring efter 25 sek uden svar (markeres `NOT_HOME`). | Sekventiel WebRTC + auto-advance + 25 s timeout. |

> **Nuværende begrænsning:** Power Dialer og Predictive ringer kun til **ét lead ad gangen pr. agent**. Industristandarderne ringer til 2-3 numre samtidig og bruger AMD til at droppe svaremaskiner. Det er den næste fase.

---

## Næste fase: «True Parallel» (server-side dialer + AMD)

### Mål

- Reel parallel-udringning: dial **N numre samtidig pr. agent** (typisk N=2 power, N=3 predictive)
- Drop svaremaskiner automatisk via Telnyx **AMD** (`answering_machine_detection: "premium"`)
- Når et menneske tager telefonen → bridge call'et ind i agentens browser-WebRTC-session
- Pacing-algoritme der tilpasser dial-ratio dynamisk for at holde abandon rate ≤ 3 %

### Arkitektur

```
   ┌──────────────┐                                ┌──────────────┐
   │   Agent      │       (1) WebRTC token         │  Allio API   │
   │  (browser)   │  ────────────────────────────► │  (Vercel)    │
   │              │                                │              │
   │              │  ◄──── (2) Token + ICE ─────── │              │
   │              │                                └──────┬───────┘
   │              │                                       │
   │              │  ◄════ (5) bridge audio ══════╗       │ (3) presence: ready
   │              │                               ║       ▼
   │              │                               ║  ┌─────────────┐
   └──────┬───────┘                               ║  │  Dialer     │
          │                                       ║  │  Service    │
          │ (4) WS to Telnyx WebRTC               ║  │ (Cron/Loop) │
          │    + agent-call-control-id stored     ║  │             │
          ▼                                       ║  └──────┬──────┘
   ┌──────────────┐                               ║         │ (6) POST /v2/calls
   │  Telnyx      │ ◄─────────────────────────────╝         │   (1 lead pr. opkald, AMD on)
   │  Call        │                                         ▼
   │  Control     │ ◄─────────────────────── (7) webhooks ──┐
   │  + WebRTC    │ call.initiated, call.answered, call.machine.detection.ended,
   │              │ call.hangup, call.bridged
   └──────────────┘
```

### Hovedkomponenter (skal bygges)

#### 1. **DB-schema-udvidelser** (`prisma/schema.prisma`)

```prisma
model AgentSession {
  id              String   @id @default(cuid())
  userId          String
  campaignId      String
  status          String   // "ready" | "ringing" | "talking" | "wrap_up" | "offline"
  callControlId   String?  // Telnyx call-id for agentens "always-on" leg
  lastHeartbeat   DateTime @updatedAt
  createdAt       DateTime @default(now())
  user            User     @relation(fields: [userId], references: [id])
  campaign        Campaign @relation(fields: [campaignId], references: [id])
  @@index([campaignId, status])
}

model DialerCallLog {
  id              String   @id @default(cuid())
  campaignId      String
  leadId          String?
  agentUserId     String?
  callControlId   String   @unique
  legId           String   // Telnyx leg-id (call_leg_id)
  direction       String   // "outbound" | "inbound" | "agent-leg"
  state           String   // "initiated" | "ringing" | "answered" | "machine" | "hangup" | "bridged"
  amdResult       String?  // "human" | "machine" | "unknown" | "fax"
  bridgeTargetId  String?  // bridged-to call_control_id
  startedAt       DateTime @default(now())
  endedAt         DateTime?
  hangupCause     String?
  hangupSource    String?
  recordingUrl    String?
  rawEvents       Json?    // last N webhook payloads
  campaign        Campaign @relation(fields: [campaignId], references: [id])
  lead            Lead?    @relation(fields: [leadId], references: [id])
  @@index([campaignId, startedAt])
  @@index([leadId])
}

model DialerQueueItem {
  id              String   @id @default(cuid())
  campaignId      String
  leadId          String   @unique
  reservedAt      DateTime @default(now())
  expiresAt       DateTime
  attempts        Int      @default(0)
  lastResult      String?
  campaign        Campaign @relation(fields: [campaignId], references: [id])
  lead            Lead     @relation(fields: [leadId], references: [id])
  @@index([campaignId, reservedAt])
}
```

#### 2. **API-routes**

| Route | Metode | Formål |
|---|---|---|
| `/api/dialer/agent/presence` | POST | Agent heartbeat (status, capacity). Kører hver 5-10 s fra workspace |
| `/api/dialer/agent/answer-leg` | POST | Agent åbner sin "altid-live"-WebRTC-leg så server kan bridge til den |
| `/api/dialer/dispatch` | POST | (Cron eller serverside-loop) Dispatch næste batch af opkald baseret på pacing |
| `/api/telnyx/webhooks/call-events` | POST | Modtag Telnyx call-events. Opdater DialerCallLog. Trigger bridge ved AMD=human |
| `/api/dialer/abandon-rate` | GET | Metrics til admin-dashboard |

#### 3. **Telnyx-konfiguration**

- **Call Control Application** (allerede oprettet via `TELNYX_CONNECTION_ID`)
- **Webhook-URL:** Sættes i Telnyx-portalen til `${PUBLIC_URL}/api/telnyx/webhooks/call-events`
- **AMD:** Premium-feature på Telnyx-konto. Aktiveres pr. opkald via:
  ```js
  fetch("https://api.telnyx.com/v2/calls", {
    method: "POST",
    body: JSON.stringify({
      connection_id: TELNYX_CONNECTION_ID,
      to: leadE164,
      from: TELNYX_FROM_NUMBER,
      answering_machine_detection: "premium",
      answering_machine_detection_config: {
        total_analysis_time_millis: 3500,
        after_greeting_silence_millis: 800,
      },
      client_state: base64(JSON.stringify({ leadId, campaignId, agentSessionId })),
    }),
  })
  ```

#### 4. **Bridge-flow** (kerne-sværeste del)

1. Agent åbner workspace med `voipSession=1` → browser WebRTC connecter til Telnyx Credential Connection (allerede gjort i dag).
2. Browser kalder `POST /api/dialer/agent/answer-leg` → server finder agentens `call_control_id` (fra det aktive WebRTC-call) og gemmer i `AgentSession.callControlId`. Agent-leg lytter «mute» til en Telnyx-kø.
3. Dispatch dialer leadet via `POST /v2/calls` (med AMD).
4. Telnyx ringer. Webhook-events:
   - `call.initiated` → log
   - `call.answered` + `call.machine.detection.ended {result: "human"}` → bridge!
   - `call.machine.detection.ended {result: "machine"}` → hangup, marker lead `VOICEMAIL`, fortsæt
5. Bridge:
   ```js
   fetch(`https://api.telnyx.com/v2/calls/${leadCallControlId}/actions/bridge`, {
     method: "POST",
     body: JSON.stringify({
       call_control_id: agentSession.callControlId,
       mute_dtmf: "none",
       park_after_unbridge: "self",
     }),
   })
   ```
6. Agent hører nu lead. Når enten part lægger på → `call.hangup` → marker `AgentSession.status = "wrap_up"`. Efter X sek → `ready` igen → klar til næste dispatch.

#### 5. **Pacing-algoritme** (Predictive)

```
abandon_rate_target = 0.03  // 3 %
abandon_rate_actual = abandons_last_hour / answers_last_hour
ratio = clamp(2.0 + (abandon_rate_target - abandon_rate_actual) * 10, 1.0, 3.0)
calls_to_dispatch = ready_agents * ratio - calls_in_flight
```

Power Dialer: ratio er fast = 1.0 (1 opkald pr. ledig agent ad gangen, men starter straks når agent er ready).

#### 6. **Frontend-tilpasninger**

- Workspace heartbeat: send presence hver 5 s. Sæt status = `talking` når strip har `lineStatus === "live"`.
- Vent-tilstand: Agent kan vente på et lead; UI viser "Venter på næste connection… (3 numre ringer)".
- Lead bliver injiceret i UI'en når bridge'en sker (server pusher lead-id via WebSocket eller server-sent events).
- Workspace skal kunne **modtage** et lead i stedet for at trække det selv.

### Implementations-faser

| Fase | Indhold | Indikativ tid |
|---|---|---|
| **A** | DB-schema + migrations | 1 dag |
| **B** | Webhook-route + DialerCallLog (passiv logging) | 1-2 dage |
| **C** | AgentSession + presence-API + workspace-heartbeat | 1 dag |
| **D** | "Always-on" agent-leg via WebRTC + capture call_control_id | 2-3 dage |
| **E** | Server-side dispatcher: 1 opkald → bridge ved AMD=human | 3-4 dage |
| **F** | Parallel dispatch + pacing | 2-3 dage |
| **G** | Admin-dashboard (abandon rate, calls pr. agent, AMD-fordeling) | 2 dage |

**Total:** ~3 ugers fokuseret arbejde for én udvikler.

### Risici og åbne spørgsmål

1. **AMD som premium feature:** Skal Telnyx-kontoen aktivere det? Pris pr. minut stiger.
2. **Webhook-leverance på Vercel:** Funktioner har 10-30 sek max. Bridge-handling skal være hurtig + idempotent.
3. **WebRTC-leg-id:** Telnyx WebRTC-SDK eksponerer `call.callControlId` på den lokale call. Det kan gemmes serverside via en client → server message efter `newCall`.
4. **Hot-reload af agent-leg:** Hvis agentens browser refresher, skal vi fjerne den gamle `AgentSession` og oprette ny — ellers ringer dispatch ud til en død leg.
5. **Compliance:** Predictive med abandon rate > 3 % er reguleret i flere lande. Tjek dansk lov + DPA.

---

## Filer at læse for kontekst (fase 1 — det der er bygget i dag)

```168:184:app/components/campaign-voip-strip.tsx
type Props = {
  leadId: string;
  campaignId: string;
  leadPhone: string;
  dialMode: CampaignDialMode;
  autoStartCall: boolean;
  onUnansweredTimeout?: () => void;
  unansweredTimeoutMs?: number;
};
```

Søgeord når du tager arbejdet op igen: `voipAutoStart`, `autoDialPaused`, `onUnansweredTimeout`, `DialerCallLog`, `AgentSession`.
