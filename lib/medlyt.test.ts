import { describe, expect, it } from "vitest";
import { medlytButtonTone } from "@/lib/medlyt";

describe("medlytButtonTone", () => {
  it("green when talking (dialer i brug)", () => {
    expect(medlytButtonTone("talking")).toBe("green");
  });
  it("blue when ringing (dialer i brug)", () => {
    expect(medlytButtonTone("ringing")).toBe("blue");
  });
  it("disabled when dialer ikke er i et opkald", () => {
    expect(medlytButtonTone("ready")).toBe("disabled");
    expect(medlytButtonTone("paused")).toBe("disabled");
    expect(medlytButtonTone("wrap_up")).toBe("disabled");
    expect(medlytButtonTone("offline")).toBe("disabled");
  });
});
