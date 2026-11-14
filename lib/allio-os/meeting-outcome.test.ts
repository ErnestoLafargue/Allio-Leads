import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseAllioOsOutcome, verifyAllioOsSignature } from "./meeting-outcome";

const secret = "test-secret";
const sign = (ts: string, body: string) => "sha256=" + createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

describe("Allio OS mødeudfald", () => {
  it("godkender en korrekt signatur og afviser alt andet", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ lead_id: "abc", outcome: "salg" });
    expect(verifyAllioOsSignature({ rawBody: body, timestamp: ts, signature: sign(ts, body), secret })).toBe(true);
    expect(verifyAllioOsSignature({ rawBody: body + " ", timestamp: ts, signature: sign(ts, body), secret })).toBe(false);
    expect(verifyAllioOsSignature({ rawBody: body, timestamp: ts, signature: sign(ts, body), secret: "andet" })).toBe(false);
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    expect(verifyAllioOsSignature({ rawBody: body, timestamp: old, signature: sign(old, body), secret })).toBe(false);
  });

  it("tager kun kendte udfald", () => {
    expect(parseAllioOsOutcome("salg")).toBe("salg");
    expect(parseAllioOsOutcome(null)).toBe(null);
    expect(parseAllioOsOutcome("SALE")).toBe(undefined);
    expect(parseAllioOsOutcome(undefined)).toBe(undefined);
  });
});
