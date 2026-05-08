import { describe, expect, it } from "vitest";
import { decodeDialerClientState, encodeDialerClientState } from "@/lib/dialer-shared";

describe("decodeDialerClientState", () => {
  it("v1 round-trip", () => {
    const s = encodeDialerClientState({
      v: 1,
      kind: "lead",
      campaignId: "c1",
      leadId: "l1",
      dispatchId: "d1",
    });
    const d = decodeDialerClientState(s);
    expect(d?.v).toBe(1);
    expect(d?.kind).toBe("lead");
    expect(d?.campaignId).toBe("c1");
    if (d?.v === 1) expect(d.leadId).toBe("l1");
  });

  it("v2: lead med queueItemId og batchId", () => {
    const s = encodeDialerClientState({
      v: 2,
      kind: "lead",
      campaignId: "camp",
      leadId: "lead",
      queueItemId: "qi",
      batchId: "b1",
      dialMode: "POWER_DIALER",
      phoneE164: "+4512345678",
    });
    const d = decodeDialerClientState(s);
    expect(d?.v).toBe(2);
    if (d?.v === 2) {
      expect(d.queueItemId).toBe("qi");
      expect(d.batchId).toBe("b1");
      expect(d.dialMode).toBe("POWER_DIALER");
      expect(d.phoneE164).toBe("+4512345678");
    }
  });

  it("afviser ukendt version", () => {
    const raw = Buffer.from(JSON.stringify({ v: 99, kind: "lead", campaignId: "x" }), "utf8").toString(
      "base64",
    );
    expect(decodeDialerClientState(raw)).toBeNull();
  });
});
