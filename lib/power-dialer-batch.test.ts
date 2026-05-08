import { describe, expect, it } from "vitest";
import { powerDialerEligibleOrPastWhere } from "./power-dialer-batch";

describe("powerDialerEligibleOrPastWhere", () => {
  it("Tillader leads uden cooldown eller hvor eligible-tidspunkt er passeret", () => {
    const now = new Date("2026-05-08T12:00:00.000Z");
    const w = powerDialerEligibleOrPastWhere(now);
    expect(w.OR).toHaveLength(2);
    expect(w.OR?.[0]).toEqual({ powerDialerEligibleAfter: { equals: null } });
    expect(w.OR?.[1]).toEqual({ powerDialerEligibleAfter: { lte: now } });
  });
});
