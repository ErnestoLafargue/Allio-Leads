import { describe, expect, it } from "vitest";
import { medlytButtonTone } from "@/lib/medlyt";

describe("medlytButtonTone", () => {
  it("green when talking with lead leg", () => {
    expect(medlytButtonTone("talking", true)).toBe("green");
  });
  it("blue when ringing with lead leg", () => {
    expect(medlytButtonTone("ringing", true)).toBe("blue");
  });
  it("disabled without lead leg or other statuses", () => {
    expect(medlytButtonTone("talking", false)).toBe("disabled");
    expect(medlytButtonTone("ringing", false)).toBe("disabled");
    expect(medlytButtonTone("ready", true)).toBe("disabled");
    expect(medlytButtonTone("paused", true)).toBe("disabled");
  });
});
