import { describe, expect, it } from "vitest";
import { PREFERRED_ANSWERS, withPreferred } from "./preferred-answers";

describe("withPreferred", () => {
  it("lægger Ernestos svar oven på ugens script", () => {
    const out = withPreferred({ send_email: "fra scriptet", price: "pris-svar" });
    expect(out.send_email).toBe(PREFERRED_ANSWERS.send_email!.line);
    expect(out.price).toBe("pris-svar");
  });
});
