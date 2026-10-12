import { describe, expect, it } from "vitest";
import { lineMatch, ScriptTracker } from "./script-tracker";

const lines = [
  { phase: "opening", text: "Hej, det er Ernesto fra Allio – har du lige to minutter?" },
  { phase: "qualification", text: "Er det dig, der ejer klinikken, eller er der andre med til at beslutte?" },
  { phase: "discovery", text: "Hvor mange kunder har I liggende i systemet, som ikke har booket i seks måneder?" },
  { phase: "close", text: "Skulle det være mandag næste uge, eller skulle det være onsdag?" },
];

describe("lineMatch", () => {
  it("genkender en linje sagt med egne ord og bøjninger", () => {
    expect(lineMatch("er det dig der ejer klinikken?", lines[1]!.text)).toBeGreaterThanOrEqual(0.4);
    expect(lineMatch("vejret er fint i dag", lines[1]!.text)).toBeLessThan(0.2);
    expect(lineMatch("hej Lise, det er Emil fra Allio, har du to minutter", "Hej [navn], det er [dit navn] fra Allio – har du lige to minutter?")).toBe(1);
  });
});

describe("ScriptTracker", () => {
  it("følger scriptet, går i afvigelse ved indvending og tilbage, når sælgeren har svaret", () => {
    const t = new ScriptTracker(lines);
    expect(t.nextLine?.phase).toBe("opening");
    t.onAgentUtterance("Hej det er Ernesto fra Allio, har du to minutter");
    expect(t.state).toBe("script");
    expect(t.nextLine?.phase).toBe("qualification");

    t.onDeviation();
    expect(t.state).toBe("afvigelse");
    t.onAgentUtterance("Det forstår jeg godt, vi lægger os ovenpå jeres system");
    expect(t.state).toBe("tilbage");
    expect(t.nextLine?.phase).toBe("qualification");

    t.onAgentUtterance("Hvor mange kunder har I i systemet, der ikke har booket i et halvt år?");
    expect(t.state).toBe("script");
    expect(t.nextLine?.phase).toBe("close");
  });

  it("står stille, når sælgeren siger noget uden for scriptet", () => {
    const t = new ScriptTracker(lines);
    t.onAgentUtterance("ja, nej, helt sikkert");
    expect(t.state).toBe("script");
    expect(t.position).toBe(0);
  });
});
