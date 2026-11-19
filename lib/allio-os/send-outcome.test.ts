import { describe, expect, it } from "vitest";
import { verifyAllioOsSignature } from "./meeting-outcome";
import { allioOsOutcomeFor, signAllioOsBody } from "./send-outcome";

describe("allioOsOutcomeFor", () => {
  it("oversætter Leads-udfald til Allio OS", () => {
    expect(allioOsOutcomeFor("SALE")).toBe("salg");
    expect(allioOsOutcomeFor("IN_PROGRESS")).toBe("afventer");
    expect(allioOsOutcomeFor("LOST")).toBe("tabt");
    expect(allioOsOutcomeFor("REBOOK")).toBe("genbook");
  });

  it("afventende og afholdt er intet udfald i Allio OS", () => {
    expect(allioOsOutcomeFor("PENDING")).toBeNull();
    expect(allioOsOutcomeFor("HELD")).toBeNull();
    expect(allioOsOutcomeFor(null)).toBeNull();
  });

  it("sender ikke ej mødt, som Allio OS ikke kender", () => {
    expect(allioOsOutcomeFor("CANCELLED")).toBeUndefined();
  });
});

describe("signAllioOsBody", () => {
  it("bruger samme signatur som den anden vej (timestamp.body, HMAC-SHA256)", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ lead_id: "l1", outcome: "salg" });
    const signature = signAllioOsBody("hemmelig", timestamp, body);
    expect(verifyAllioOsSignature({ rawBody: body, timestamp, signature, secret: "hemmelig" })).toBe(true);
    expect(verifyAllioOsSignature({ rawBody: body, timestamp, signature, secret: "forkert" })).toBe(false);
  });
});
