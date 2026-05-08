import { describe, expect, it } from "vitest";
import { isTelnyxChannelLimitError } from "@/lib/telnyx-call-control";

describe("isTelnyxChannelLimitError", () => {
  it("matcher Telnyx D3 channel limit fejltekst", () => {
    expect(
      isTelnyxChannelLimitError(
        "originate_failed:Connection channel limit exceeded D3. The number of concurrent calls for the Connection has reached its limit.",
      ),
    ).toBe(true);
  });

  it("matcher tekst med concurrent calls + connection", () => {
    expect(
      isTelnyxChannelLimitError("The number of concurrent calls for the Connection has reached its limit"),
    ).toBe(true);
  });

  it("returnerer false for almindelige telnyx-fejl", () => {
    expect(isTelnyxChannelLimitError("authentication failed")).toBe(false);
    expect(isTelnyxChannelLimitError("invalid destination number")).toBe(false);
  });
});

