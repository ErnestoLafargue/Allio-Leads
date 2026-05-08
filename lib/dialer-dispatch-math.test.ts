import { describe, expect, it } from "vitest";
import {
  computeDispatchNewCallsNeeded,
  parseTelnyxOutboundChannelLimitFromEnv,
} from "@/lib/dialer-dispatch-math";

describe("dialer-dispatch-math", () => {
  it("computeDispatchNewCallsNeeded: power 2 agenter ×5 − 4 in-flight ⇒ 6", () => {
    const { targetTotal, newCallsNeeded } = computeDispatchNewCallsNeeded({
      readyCount: 2,
      ratio: 5,
      inFlightCalls: 4,
      maxNewCallsOverride: null,
      channelLimit: null,
    });
    expect(targetTotal).toBe(10);
    expect(newCallsNeeded).toBe(6);
  });

  it("computeDispatchNewCallsNeeded: lavere targetTotal afbryder ikke eksplicit — kun færre nye", () => {
    const { targetTotal, newCallsNeeded } = computeDispatchNewCallsNeeded({
      readyCount: 1,
      ratio: 5,
      inFlightCalls: 9,
      maxNewCallsOverride: null,
      channelLimit: null,
    });
    expect(targetTotal).toBe(5);
    expect(newCallsNeeded).toBe(0);
  });

  it("computeDispatchNewCallsNeeded: channelLimit begrænser headroom", () => {
    const { newCallsNeeded } = computeDispatchNewCallsNeeded({
      readyCount: 2,
      ratio: 5,
      inFlightCalls: 4,
      maxNewCallsOverride: null,
      channelLimit: 8,
    });
    expect(newCallsNeeded).toBe(4);
  });

  it("parseTelnyxOutboundChannelLimitFromEnv: tom og ugyldig", () => {
    expect(parseTelnyxOutboundChannelLimitFromEnv(undefined)).toBeNull();
    expect(parseTelnyxOutboundChannelLimitFromEnv("0")).toBeNull();
    expect(parseTelnyxOutboundChannelLimitFromEnv("12")).toBe(12);
  });
});
