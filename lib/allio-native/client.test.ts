import { describe, expect, it } from "vitest";
import { isAllioTransientFailure } from "./client";

describe("isAllioTransientFailure", () => {
  it("genkender Allios gateway-timeout", () => {
    expect(
      isAllioTransientFailure(
        503,
        '{"error":"Upstream unavailable","message":"Supabase backend is temporarily unavailable"}',
      ),
    ).toBe(true);
  });

  it("genkender netværksfejl og 502/504", () => {
    expect(isAllioTransientFailure(0, "")).toBe(true);
    expect(isAllioTransientFailure(502, "")).toBe(true);
    expect(isAllioTransientFailure(504, "")).toBe(true);
  });

  it("behandler valideringsfejl som rigtige fejl", () => {
    expect(isAllioTransientFailure(400, '{"error":{"code":"VALIDATION_ERROR"}}')).toBe(false);
    expect(isAllioTransientFailure(409, '{"error":{"code":"DUPLICATE_EMAIL"}}')).toBe(false);
  });
});
