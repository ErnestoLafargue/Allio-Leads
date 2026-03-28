# Deploy Allio Leads på Vercel + GitHub

## Hvorfor PostgreSQL?

Vercel kører **serverless** — der findes ingen vedvarende disk til `dev.db` (SQLite). Alle leads, noter og brugere skal ligge i en **hosted database** (fx Neon). Projektet er sat op til **PostgreSQL**.

## 1. GitHub

1. Opret et repo på GitHub og push koden (mappen `allio-leads` som rod, eller monorepo med den som undermappe — så skal **Root Directory** i Vercel sættes til `allio-leads`).
2. Commit **ikke** `.env` (den er secrets).

## 2. Database (Neon — anbefalet)

1. Gå til [neon.tech](https://neon.tech), opret projekt og database.
2. Kopiér **connection string** (PostgreSQL, med `sslmode=require`).
3. Brug den som `DATABASE_URL` (se nedenfor).

## 3. Vercel

1. [vercel.com](https://vercel.com) → **Add New Project** → importér GitHub-repo.
2. **Root Directory**: `allio-leads` (hvis repoet indeholder hele «Allio Note»-mappen).
3. **Environment Variables** (Production — og evt. Preview):

| Navn | Værdi |
|------|--------|
| `DATABASE_URL` | Din Neon connection string |
| `AUTH_SECRET` | Lang tilfældig streng (`openssl rand -base64 32`) |
| `AUTH_URL` | Din offentlige URL, fx `https://dit-projekt.vercel.app` |
| `SEED_ADMIN_PASSWORD` | Kun til **første** seed lokalt eller via engangs-script (valgfri på Vercel) |

4. Deploy. Build kører `prisma migrate deploy` og opretter tabeller i Neon.

## 4. Første admin-bruger

Efter første succesfulde deploy er databasen tom. Opret admin **fra din maskine** mod produktions-DB:

```bash
cd allio-leads
export DATABASE_URL="postgresql://..."   # samme som i Vercel
export AUTH_SECRET="..."                 # samme som i Vercel
export SEED_ADMIN_PASSWORD="DinSikreKode"
npm install
npx prisma migrate deploy
npm run db:seed
```

Fjern eller roter `SEED_ADMIN_PASSWORD` bagefter. Sælgere oprettes som **ADMIN** i appen eller via udvidelse af seed.

## 5. Dele med sælgere

- Send dem URL’en: `https://dit-projekt.vercel.app`
- De logger ind med de brugere I opretter (roller `ADMIN` / `SELLER`).

## 6. Migrering fra gammel SQLite

Ældre `dev.db` migreres **ikke** automatisk. Eksporter evt. leads via CSV og importer igen i produktion, eller lav et manuelt export/import.

## Fejlsøgning

- **Build fejler på Prisma**: Tjek at `DATABASE_URL` er sat under **Environment Variables** for det miljø Vercel bygger med, og at Neon tillader forbindelser fra Vercels IP (Neon gør som standard).
- **Login virker ikke efter deploy**: Sæt `AUTH_URL` til den præcise HTTPS-URL Vercel giver.
