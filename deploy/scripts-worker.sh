#!/usr/bin/env bash
# Starter workeren for «Scripts & Træning» (transskribering + analyse af nye samtaler, løbende).
# Miljø: .env.local (nøgler) + den fil, der vælger databasen (standard .env.worker; i test: .env.branch).
# Den fil SKAL sætte DATABASE_URL og BRANCH_GUARD (en del af databasens host) — ellers stopper workeren.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_DB_FILE="${WORKER_ENV_FILE:-.env.worker}"
set -a
. ./.env.local
. "./$ENV_DB_FILE"
set +a
exec npx tsx --tsconfig tsconfig.json scripts/worker.ts --interval-min "${WORKER_INTERVAL_MIN:-10}"
