import { describe, expect, it } from "vitest";
import { classifyPredictiveDialFailure } from "@/lib/predictive-dial-errors";

describe("classifyPredictiveDialFailure", () => {
  it("returnerer TELNYX_CHANNEL_LIMIT ved D3 channel limit fejl", () => {
    const code = classifyPredictiveDialFailure({
      message:
        "originate_failed:Connection channel limit exceeded D3. The number of concurrent calls for the Connection has reached its limit.",
    });
    expect(code).toBe("TELNYX_CHANNEL_LIMIT");
  });

  it("returnerer TELNYX_DIAL_FAILED for andre fejl", () => {
    const code = classifyPredictiveDialFailure({
      message: "Invalid destination number",
    });
    expect(code).toBe("TELNYX_DIAL_FAILED");
  });
});

