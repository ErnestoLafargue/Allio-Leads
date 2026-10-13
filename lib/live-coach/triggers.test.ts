import { describe, expect, it } from "vitest";
import { DEFAULT_RESPONSES, detectBuyingSignal, detectMachine, detectObjection, triggerCard } from "./triggers";

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
      objection: null,
      customer: "",
      why: "Kender ikke værdien",
      line: "Lad os se på jeres tal først.",
      silent: false,
      fresh: false,
      move: null,
    });
    expect(parseCoachText("SIGNAL: klarhed\nHVORFOR: Tror det").line).toBe("");
    expect(parseCoachText("SIGNAL: ingen").silent).toBe(true);
    const full = parseCoachText("SIGNAL: okonomi\nINDVENDING: price\nKUNDE: Nysgerrig, men prisbevidst\nHVORFOR: x\nREPLIK: y");
    expect(full.objection).toBe("price");
    expect(parseCoachText("SIGNAL: okonomi\nNYT: ja\nREPLIK: y").fresh).toBe(true);
    expect(parseCoachText("SIGNAL: skepsis\nTRÆK: Spørg\nREPLIK: y").move).toBe("sporg");
    expect(parseCoachText("SIGNAL: klarhed\nTRÆK: **luk**").move).toBe("luk");
    expect(parseCoachText("SIGNAL: klarhed\nTRÆK: forklar").move).toBe("forklar");
    expect(full.customer).toBe("Nysgerrig, men prisbevidst");
    expect(parseCoachText("SIGNAL: ingen\nINDVENDING: ingen\nKUNDE: Positiv").objection).toBeNull();
    expect(parseCoachText("SIGNAL: Lav interesse\nHVORFOR: x\nREPLIK: y").signal).toBe("lav_interesse");
    expect(parseCoachText("SIGNAL: **Økonomi**").signal).toBe("okonomi");
  });
});

describe("detectMachine", () => {
  it("genkender telefonsvarere fra rigtige opkald", () => {
    expect(detectMachine("Hej, du har ringet til Hellerup Laserklinik. Vi er i øjeblikket optaget af behandlinger, men læg en besked med dit navn")).toBe("voicemail");
    expect(detectMachine("Indtal venligst din besked efter tonen.")).toBe("voicemail");
    expect(detectMachine("Dette er telefonsvareren for den person, du forsøger at kontakte")).toBe("voicemail");
    expect(detectMachine("Velkommen til voicemail")).toBe("voicemail");
    expect(detectMachine("The person you are calling is not available")).toBe("voicemail");
  });

  it("genkender omstillinger, køer og menuer", () => {
    expect(detectMachine("Hej, du har ringet til Rosenfeldt Fotografi, vent venligst.")).toBe("ivr");
    expect(detectMachine("Vent venligst. Dit opkald stilles nu om til en medarbejder.")).toBe("ivr");
    expect(detectMachine("Du er nummer 1 i køen.")).toBe("ivr");
    expect(detectMachine("Velkommen til Vickuras. Du har nu følgende valgmuligheder")).toBe("ivr");
    expect(detectMachine("Tast 1 for at aflyse en tid; tast 2 for personlig betjening.")).toBe("ivr");
  });

  it("lader almindelige kunder være", () => {
    expect(detectMachine("Ja hej, det er Lise")).toBeNull();
    expect(detectMachine("Klinik Sol, det er Mette")).toBeNull();
    expect(detectMachine("Hvad koster det?")).toBeNull();
    expect(detectMachine("Vi har ikke tid lige nu")).toBeNull();
  });
});

describe("splitReply", () => {
  it("deler replikken i korte linjer med spørgsmålet til sidst", async () => {
    const { splitReply } = await import("./card");
    expect(splitReply("Helt fair. Specialisten viser først, hvad der er at hente på jeres egne data — passer mandag eller onsdag?")).toEqual([
      "Helt fair.",
      "Specialisten viser først, hvad der er at hente på jeres egne data",
      "passer mandag eller onsdag?",
    ]);
    expect(splitReply("Det er 2.500 kr. om måneden. Skal vi sige mandag?")).toEqual(["Det er 2.500 kr. om måneden.", "Skal vi sige mandag?"]);
    expect(splitReply("Kort svar")).toEqual(["Kort svar"]);
  });
});

describe("detectBuyingSignal", () => {
  it("fanger købssignaler og lader almindelig snak være", () => {
    expect(detectBuyingSignal("Okay, hvordan foregår det så?")).toBe(true);
    expect(detectBuyingSignal("Det lyder faktisk rigtig spændende")).toBe(true);
    expect(detectBuyingSignal("Hvornår kan I komme?")).toBe(true);
    expect(detectBuyingSignal("Vi er tre behandlere")).toBe(false);
    expect(detectBuyingSignal("Nej tak, vi har det fint")).toBe(false);
  });
});
