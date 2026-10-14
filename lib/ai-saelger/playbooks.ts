/**
 * Playbook-teksten til en tilgang (docs/ai-saelger/playbooks/*.md). Stien er fast inden for mappen, så
 * serverless-bundlen kun tager playbooks med (ikke hele projektet).
 */
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { APPROACHES, type ApproachKey } from "./agents";

export function readPlaybook(approach: ApproachKey): string {
  const file = APPROACHES[approach].file;
  return file ? readFileSync(join(process.cwd(), "docs", "ai-saelger", "playbooks", basename(file)), "utf8") : "";
}
