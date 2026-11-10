import { describe, expect, it } from "vitest";
import { isTelnyxBalanceExhausted } from "./telnyx-balance";

describe("isTelnyxBalanceExhausted", () => {
  it("minus eller nul = spærret", () => {
    expect(isTelnyxBalanceExhausted({ available_credit: "-15.13", balance: "-15.13" })).toBe(true);
    expect(isTelnyxBalanceExhausted({ available_credit: "0.00" })).toBe(true);
  });
  it("positiv saldo eller ukendt = ikke spærret", () => {
    expect(isTelnyxBalanceExhausted({ available_credit: "42.10" })).toBe(false);
    expect(isTelnyxBalanceExhausted({})).toBe(false);
    expect(isTelnyxBalanceExhausted(null)).toBe(false);
  });
});
