import { describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { verifyAllioNativeWebhookSignature } from "@/lib/allio-native/webhook-verify";

describe("verifyAllioNativeWebhookSignature", () => {
  it("accepterer gyldig signatur", () => {
    const secret = "whsec_test_secret";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = '{"id":"evt_1","type":"booking.created"}';
    const key = createHash("sha256").update(secret).digest("hex");
    const signature =
      "sha256=" +
      createHmac("sha256", key).update(`${timestamp}.${rawBody}`).digest("hex");

    expect(
      verifyAllioNativeWebhookSignature({
        rawBody,
        timestamp,
        signature,
        secret,
      }),
    ).toBe(true);
  });

  it("afviser forket signatur", () => {
    expect(
      verifyAllioNativeWebhookSignature({
        rawBody: "{}",
        timestamp: String(Math.floor(Date.now() / 1000)),
        signature: "sha256=deadbeef",
        secret: "whsec_test",
      }),
    ).toBe(false);
  });
});
