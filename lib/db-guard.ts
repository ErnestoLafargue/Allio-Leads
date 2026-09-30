/**
 * Beskytter scripts (import, transskribering, analyse, worker) mod at skrive til en forkert database.
 * BRANCH_GUARD (fx i .env.branch) er en del af den forventede host; scriptet stopper, hvis
 * DATABASE_URL peger et andet sted hen — fx på produktion via .env.local.
 */
export function assertExpectedDatabase(): void {
  const guard = process.env.BRANCH_GUARD?.trim();
  const url = process.env.DATABASE_URL ?? "";
  if (!guard) {
    throw new Error(
      "BRANCH_GUARD er ikke sat — indlæs .env.branch efter .env.local (set -a; . ./.env.local; . ./.env.branch; set +a).",
    );
  }
  if (!url.includes(guard)) {
    throw new Error(`DATABASE_URL peger ikke på ${guard} — stopper for at beskytte produktionsdatabasen.`);
  }
}
