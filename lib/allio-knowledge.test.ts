import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLIO_KNOWLEDGE } from "./allio-knowledge";

describe("ALLIO_KNOWLEDGE", () => {
  it("er synkron med docs/allio.md (kør scripts/sync-allio-knowledge.ts)", () => {
    expect(ALLIO_KNOWLEDGE).toBe(readFileSync("docs/allio.md", "utf8").trim());
  });
});
