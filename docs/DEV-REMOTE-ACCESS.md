# Tilgå dev-server fra Mac (via VPS IP)

Dev-serveren skal lytte på alle interfaces (`0.0.0.0`), ikke kun `127.0.0.1`, så din Mac kan nå den via VPS’ens offentlige IP.

## 1. Start på VPS

```bash
cd /root/Allio-Leads
npm run dev:remote
```

Standardport er **3000**. Anden port: `PORT=3001 npm run dev:remote`.

## 2. Åbn i browser på Mac

Erstat med din VPS’ offentlige IP (fx fra hosting-panelet):

```text
http://72.61.182.223:3000
```

## 3. Miljøvariabler (login)

Tilføj i `.env.local` på VPS (brug din rigtige IP og port):

```env
AUTH_URL=http://72.61.182.223:3000
AUTH_SECRET=<mindst 32 tegn, fx: openssl rand -base64 32>
```

Genstart `npm run dev:remote` efter ændring.

## 4. Firewall

Port **3000/tcp** skal være åben:

- **Cloud-panel** (Hetzner, DigitalOcean, AWS SG, …): inbound TCP 3000 fra din IP (eller midlertidigt `0.0.0.0/0` kun til dev).
- **ufw på VPS** (hvis aktiv):

  ```bash
  sudo ufw allow 3000/tcp
  sudo ufw status
  ```

## 5. Sikkerhed

- Brug kun til **udvikling** — eksponer ikke produktionsdata unødigt.
- Begræns firewall til **din hjemme-IP**, ikke hele internettet, når det er muligt.
- Alternativ (sikrere): SSH-tunnel fra Mac uden at åbne port 3000:

  ```bash
  ssh -L 3000:127.0.0.1:3000 root@72.61.182.223
  ```

  Kør derefter på VPS: `npm run dev` (kun localhost), og åbn på Mac: `http://localhost:3000`.

## 4. Podio / Cal.eu fra localhost

`vercel env pull` kan **ikke** hente Sensitive-variabler (Podio, Cal.eu) — de bliver tomme i `.env.local`.

Kopier manuelt fra **Vercel → Settings → Environment Variables → Production → Reveal**:

```env
PODIO_CLIENT_ID="..."
PODIO_CLIENT_SECRET="..."
PODIO_MOEDER_APP_ID="..."
PODIO_MOEDER_APP_TOKEN="..."
CALCOM_HOST="api.cal.eu"
CALCOM_API_KEY="cal_live_..."
CALCOM_EVENT_TYPE_ID="340981"
```

Tjek at nøglerne er sat:

```bash
node scripts/check-local-env.mjs
```

Genstart dev-serveren efter ændring.

### Allio → Podio / Cal.eu (ved booking)

Virker fra localhost når nøglerne ovenfor er sat (`npm run check:env`).

### Podio → Allio (mødeudfald: Tabt / Vundet / Genbook)

Podio sender webhook **kun** til production:

`https://allio-leads.vercel.app/api/webhooks/podio`

Localhost kan **ikke** modtage webhooks direkte. Fordi dev bruger samme Neon-database som production, vises opdateret udfald på localhost efter **side-refresh** — når webhooken på production har kørt.

**Manuel sync under dev** (efter du har ændret status i Podio):

```bash
# Via production (anbefalet — samme DB)
curl -s -H "Authorization: Bearer $AUTH_SECRET" \
  "https://allio-leads.vercel.app/api/cron/sync-podio-outcome?leadId=<LEAD_ID>"

# Eller genafspil via Podio item-id
curl -s -H "Authorization: Bearer $AUTH_SECRET" \
  "https://allio-leads.vercel.app/api/cron/replay-podio-webhook?itemId=<PODIO_ITEM_ID>"
```

Refresh lead-siden bagefter — udfaldet skal matche Podio-status (fx «Møde Tabt» → **Tabt**).

**Tip:** Podio sender kun webhook ved **ændring**. Hvis status allerede var sat før webhook virkede, skift status væk og tilbage i Podio, eller brug `sync-podio-outcome` ovenfor.

## Fejlsøgning

| Problem | Løsning |
|--------|---------|
| Timeout fra Mac | Tjek cloud firewall + `ss -tlnp \| grep 3000` på VPS |
| Login fejler | Sæt `AUTH_URL` til præcis den URL du bruger i browseren |
| Connection refused | Er `npm run dev:remote` kørende? |
| Podio udfald synker ikke til Allio | Webhook rammer kun production; brug `sync-podio-outcome?leadId=...` og refresh siden |
