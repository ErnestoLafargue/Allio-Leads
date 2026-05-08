# Predictive vs. power dialer — fejlsøgning og verifikation

**Kampagne-arbejde (workspace):** Både **Power** og **Predictive** bruger **samme WebRTC-sti**: [`/api/telnyx/manual-call/prepare`](app/api/telnyx/manual-call/prepare/route.ts) (predictive: obligatorisk succes) → `client.newCall` i [`campaign-voip-strip.tsx`](app/components/campaign-voip-strip.tsx) med `client_state` **`kind: manual`** — optagelse og korrelation i [`call-events`](app/api/telnyx/webhooks/call-events/route.ts).

**Parallel server-dispatch** (`POST /api/dialer/dispatch`, AMD + bridge) køres fra workspace-heartbeat **kun for `POWER_DIALER`**, ikke for `PREDICTIVE` ([`campaign-workspace.tsx`](app/(dashboard)/kampagner/[id]/arbejd/campaign-workspace.tsx) `enableDispatch`).

`POST /api/telnyx/predictive-call/start` er **deprecated** og returnerer **410** (gamle klienter).

Se [TELNYX_PARALLEL_DIALER.md](TELNYX_PARALLEL_DIALER.md) for Telnyx-portal og miljøvariabler.

## 1. Telnyx MCP — hvad I skal afstemme

### Call Control Applications (Voice API)

Kør Telnyx MCP `list_call_control_applications` og sammenlign **`id`** med `TELNYX_CONNECTION_ID` i jeres deployment (Vercel).

**Snapshot (hentet via MCP, kan ændre sig):**

| application_name      | id (Connection / Application ID) | webhook_event_url (uddrag) |
|-----------------------|----------------------------------|------------------------------|
| allio-powerdialer-8ch | `2955287142399476855`            | `https://allio-leads.vercel.app/api/telnyx/webhooks/call-events` |
| allio-powerdialer     | `2943899276838700571`            | samme base path |

- **Server-side parallel dispatch (power)** bruger **`getTelnyxConnectionId()`** til udgående lead-ben — jf. [lib/telnyx-call-control.ts](lib/telnyx-call-control.ts).
- **WebRTC** bruger agent-login til PSTN; webhooks til optagelse mv. kommer stadig fra Call Control-appen når `client_state` er sat.

### `list_connections` (credential_connection)

Telnyx MCP `list_connections` returnerer typisk **SIP / WebRTC credential connections**. **Bridge til agent** efter server-AMD (kun relevant for power/parallel-flow) bruger per-bruger `telnyxCredentialConnectionId` — se [lib/dialer-bridge.ts](lib/dialer-bridge.ts).

## 2. Neon RPC / SQL — databasediagnostik

**Projekt-ID** (Neon «Allio Leads»): `proud-king-81787758` (tjek altid `list_projects` hvis I har flere).

### Kampagnetil-mode

```sql
SELECT "dialMode", COUNT(*) AS cnt FROM "Campaign" GROUP BY "dialMode" ORDER BY cnt DESC;
```

### Predictive-kampagner

```sql
SELECT id, name, "dialMode" FROM "Campaign"
WHERE "dialMode" = 'PREDICTIVE' ORDER BY name;
```

### Agent-sessioner (primært power / parallel dispatch)

Ved **kun** predictive workspace kan `AgentSession` være tom uden at det blokerer opkald (ingen server-bridge).

```sql
SELECT s.id, s."campaignId", s."userId", s.status, s."lastHeartbeat"
FROM "AgentSession" s
JOIN "Campaign" c ON c.id = s."campaignId"
WHERE c."dialMode" IN ('PREDICTIVE', 'POWER_DIALER')
ORDER BY s."lastHeartbeat" DESC;
```

### Kø + «stale» call logs (parallel power)

```sql
SELECT state, direction, COUNT(*) FROM "DialerCallLog"
WHERE "endedAt" IS NULL GROUP BY 1, 2 ORDER BY 3 DESC;
```

## 3. Fejl og kode-stier (trace)

### `POST /api/telnyx/predictive-call/start` (deprecated)

| HTTP | Betydning |
|------|-----------|
| **410** | Endpoint fjernet — opdater klient; brug WebRTC som Power. |

### WebRTC predictive (strip)

| Symptom | Årsag | Fil |
|---------|--------|-----|
| Fejl før opkald | `manual-call/prepare` fejlede (403 filter, låst lead, …) | [campaign-voip-strip.tsx](app/components/campaign-voip-strip.tsx) |
| Timeout → næste lead | `onUnansweredTimeout` → VOICEMAIL + `onNext` | [campaign-workspace.tsx](app/(dashboard)/kampagner/[id]/arbejd/campaign-workspace.tsx) |
| Remote hangup / unknown cause | `detectPredictiveOutcomeFromCall` → `onPredictiveAutoOutcome` | [voip-call-messages.ts](lib/voip-call-messages.ts), strip |

### Parallel power (dispatch + AMD bridge)

Se [dialer-bridge.ts](lib/dialer-bridge.ts) (`handleAmdHuman`, `handleAmdMachine`) og [dispatch/route.ts](app/api/dialer/dispatch/route.ts).

---

Ved ændringer i Telnyx-portalen: opdater denne fil eller kør MCP igen og noter nye **application**-ID’er her, så de matcher `TELNYX_CONNECTION_ID`.
