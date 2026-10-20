import { describe, expect, it } from "vitest";
import { medlytButtonTone } from "@/lib/medlyt";

describe("medlytButtonTone", () => {
  it("green when talking", () => {
    expect(medlytButtonTone("talking")).toBe("green");
  });
  it("blue when ringing", () => {
    expect(medlytButtonTone("ringing")).toBe("blue");
  });
  it("ready when på kampagne uden opkald", () => {
    expect(medlytButtonTone("ready")).toBe("ready");
    expect(medlytButtonTone("paused")).toBe("ready");
    expect(medlytButtonTone("wrap_up")).toBe("ready");
    expect(medlytButtonTone("draining")).toBe("ready");
  });
  it("disabled when ikke i dialer", () => {
    expect(medlytButtonTone("offline")).toBe("disabled");
  });
});
