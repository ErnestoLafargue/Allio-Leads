import { describe, expect, it } from "vitest";
import { DEFAULT_RESPONSES, detectObjection, triggerCard } from "./triggers";

describe("detectObjection", () => {
  it("genkender indvendinger på ufærdig tale", () => {
    expect(detectObjection("Jamen vi har allerede et booking")?.category).toBe("has_booking_system");
    expect(detectObjection("hvad koster det egentlig")?.category).toBe("price");
    expect(detectObjection("Kan du ikke bare send mig noget på mail?")?.category).toBe("send_email");
    expect(detectObjection("Jeg har ikke tid lige nu, jeg har en kunde")?.category).toBe("no_time");
    expect(detectObjection("vi bruger et marketingbureau")?.category).toBe("has_agency");
  });

  it("finder intet i almindelig snak", () => {
    expect(detectObjection("Ja hej, det er Lise")).toBeNull();
    expect(detectObjection("")).toBeNull();
  });
});

describe("triggerCard", () => {
  it("bruger ugens script før det foretrukne svar", () => {
    const trigger = detectObjection("hvad er prisen")!;
    expect(triggerCard(trigger, { price: "Fra scriptet" })?.line).toBe("Fra scriptet");
    expect(triggerCard(trigger, {})?.line).toBe(DEFAULT_RESPONSES.price);
  });

  it("giver intet kort uden svar", () => {
    const trigger = detectObjection("jeg skal lige tænke over det")!;
    expect(trigger.category).toBe("think_about_it");
    expect(triggerCard(trigger, {})).toBeNull();
  });
});

describe("parseCoachText", () => {
  it("læser et færdigt og et ufærdigt kort", async () => {
    const { parseCoachText } = await import("./card");
    expect(parseCoachText("SIGNAL: økonomi\nHVORFOR: Kender ikke værdien\nREPLIK: Lad os se på jeres tal først.")).toEqual({
      signal: "okonomi",
      why: "Kender ikke værdien",
      line: "Lad os se på jeres tal først.",
      silent: false,
    });
    expect(parseCoachText("SIGNAL: klarhed\nHVORFOR: Tror det").line).toBe("");
    expect(parseCoachText("SIGNAL: ingen").silent).toBe(true);
  });
});
