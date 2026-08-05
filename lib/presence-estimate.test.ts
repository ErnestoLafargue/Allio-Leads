import { describe, expect, it } from "vitest";
import {
  PRESENCE_ESTIMATE_BLOCK_TAIL_SECONDS,
  PRESENCE_ESTIMATE_MAX_GAP_MS,
  estimateActiveSeconds,
} from "./presence-estimate";

const at = (minutes: number) => new Date(Date.UTC(2026, 7, 4, 8, minutes, 0));

describe("estimateActiveSeconds", () => {
  it("giver 0 for tom liste", () => {
    expect(estimateActiveSeconds([])).toBe(0);
  });

  it("enkelt hændelse giver én bloks grundtid", () => {
    expect(estimateActiveSeconds([at(0)])).toBe(PRESENCE_ESTIMATE_BLOCK_TAIL_SECONDS);
  });

  it("summerer mellemrum inden for grænsen", () => {
    // 0 → 10 → 20 min: begge mellemrum på 10 min tælles med
    expect(estimateActiveSeconds([at(0), at(10), at(20)])).toBe(
      20 * 60 + PRESENCE_ESTIMATE_BLOCK_TAIL_SECONDS,
    );
  });

  it("mellemrum over grænsen bryder blokken og tælles ikke", () => {
    // 0 → 5 min (tælles), 60 min pause (springes), 65 → 70 min (tælles)
    expect(estimateActiveSeconds([at(0), at(5), at(65), at(70)])).toBe(
      10 * 60 + 2 * PRESENCE_ESTIMATE_BLOCK_TAIL_SECONDS,
    );
  });

  it("mellemrum præcis på grænsen tælles med", () => {
    const gapMinutes = PRESENCE_ESTIMATE_MAX_GAP_MS / 60_000;
    expect(estimateActiveSeconds([at(0), at(gapMinutes)])).toBe(
      gapMinutes * 60 + PRESENCE_ESTIMATE_BLOCK_TAIL_SECONDS,
    );
  });

  it("usorteret input håndteres", () => {
    expect(estimateActiveSeconds([at(20), at(0), at(10)])).toBe(
      20 * 60 + PRESENCE_ESTIMATE_BLOCK_TAIL_SECONDS,
    );
  });
});
