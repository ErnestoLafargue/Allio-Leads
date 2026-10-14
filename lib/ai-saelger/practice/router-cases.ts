/**
 * Testsæt til routeren. Selve citaterne (rigtige kundereplikker) ligger IKKE i repoet; de indlæses fra en
 * JSON-fil (`[{ text, label, ok?, bryd? }]`), som scripts/ai-saelger-router-eval.ts får med `--cases`.
 * `label` er det bedste punkt på menuen; `ok` er andre forsvarlige punkter, fordi menuen overlapper.
 * Facit for Noul («bryd ind?»): ja, når label er i BARGE_IN_LABELS, medmindre `bryd` er sat.
 */
import { readFileSync } from "node:fs";
import { BARGE_IN_LABELS, ROUTER_LABELS, type RouterLabel } from "../router";

export type RouterCase = { text: string; label: RouterLabel; ok?: RouterLabel[]; bryd?: boolean };

export function loadRouterCases(path: string): RouterCase[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as RouterCase[];
  const valid = new Set<string>(ROUTER_LABELS);
  for (const c of raw) {
    if (!valid.has(c.label) || (c.ok ?? []).some((l) => !valid.has(l))) throw new Error(`Ukendt label i testsæt: ${JSON.stringify(c)}`);
  }
  return raw;
}

export function expectedBargeIn(c: RouterCase): boolean {
  return c.bryd ?? BARGE_IN_LABELS.has(c.label);
}
