import { describe, expect, it } from "vitest";
import {
  classifyPowerLeadHangup,
  decidePowerAmdAction,
  powerLeadEffectFor,
} from "@/lib/power-dialer-outcomes";
import { mapTelnyxAmdResult } from "@/lib/telnyx-amd-result";
import { POWER_INVALID_NUMBER_COOLDOWN_MS } from "@/lib/power-dialer-constants";

const ctx = { amdMachineCountsAttempt: true, unansweredCooldownHours: 2, requeueCooldownMs: 600_000 };

describe("decidePowerAmdAction", () => {
  it("menneske forbindes", () => {
    expect(decidePowerAmdAction(mapTelnyxAmdResult("human_residence"), "CONNECT")).toBe("CONNECT");
    expect(decidePowerAmdAction(mapTelnyxAmdResult("human_business"), "REQUEUE")).toBe("CONNECT");
  });

  it("maskine, fax og beep bliver telefonsvarer — aldrig til sælgeren", () => {
    expect(decidePowerAmdAction(mapTelnyxAmdResult("machine"), "CONNECT")).toBe("VOICEMAIL");
    expect(decidePowerAmdAction(mapTelnyxAmdResult("fax_detected"), "CONNECT")).toBe("VOICEMAIL");
    expect(decidePowerAmdAction(mapTelnyxAmdResult("beep_detected"), "CONNECT")).toBe("VOICEMAIL");
  });

  it("usikkert AMD følger kampagnens indstilling", () => {
    expect(decidePowerAmdAction(mapTelnyxAmdResult("not_sure"), "CONNECT")).toBe("CONNECT");
    expect(decidePowerAmdAction(mapTelnyxAmdResult("silence"), "REQUEUE")).toBe("REQUEUE_UNCERTAIN");
  });
});

describe("classifyPowerLeadHangup", () => {
  const base = { answered: false, bridged: false };

  it("intet svar, optaget og afvist ⇒ NO_ANSWER", () => {
    for (const cause of ["timeout", "no_answer", "user_busy", "call_rejected"]) {
      expect(classifyPowerLeadHangup({ ...base, hangupCause: cause })).toBe("NO_ANSWER");
    }
  });

  it("not_found og SIP 404/410/484/604 ⇒ ugyldigt nummer", () => {
    expect(classifyPowerLeadHangup({ ...base, hangupCause: "not_found" })).toBe("INVALID_NUMBER");
    expect(classifyPowerLeadHangup({ ...base, hangupCause: "unspecified", sipHangupCause: "404" })).toBe(
      "INVALID_NUMBER",
    );
    expect(classifyPowerLeadHangup({ ...base, hangupCause: "call_rejected", sipHangupCause: "604" })).toBe(
      "INVALID_NUMBER",
    );
  });

  it("besvaret men ikke forbundet ⇒ drop (leadet lagde på)", () => {
    expect(classifyPowerLeadHangup({ answered: true, bridged: false, hangupCause: "normal_clearing" })).toBe(
      "DROP_LEAD_HUNGUP",
    );
  });

  it("bridget ⇒ CONNECTED (sælgeren sætter udfald)", () => {
    expect(classifyPowerLeadHangup({ answered: true, bridged: true, hangupCause: "normal_clearing" })).toBe(
      "CONNECTED",
    );
  });

  it("ukendt årsag ⇒ teknisk (ingen straf)", () => {
    expect(classifyPowerLeadHangup({ ...base, hangupCause: "unspecified" })).toBe("TECHNICAL");
    expect(classifyPowerLeadHangup({ ...base, hangupCause: null })).toBe("TECHNICAL");
  });
});

describe("powerLeadEffectFor (udfaldstabel)", () => {
  it("intet svar ⇒ Træffes ikke + 1 forsøg, kampagnens cooldown styrer resten", () => {
    expect(powerLeadEffectFor("NO_ANSWER", ctx)).toEqual({
      status: "NOT_HOME",
      countAttempt: true,
      eligibleAfterMs: null,
      activitySummary: null,
    });
  });

  it("ugyldigt nummer ⇒ Træffes ikke + 1 forsøg + 7 dage", () => {
    const e = powerLeadEffectFor("INVALID_NUMBER", ctx);
    expect(e.status).toBe("NOT_HOME");
    expect(e.countAttempt).toBe(true);
    expect(e.eligibleAfterMs).toBe(POWER_INVALID_NUMBER_COOLDOWN_MS);
    expect(e.activitySummary).toContain("findes ikke");
  });

  it("telefonsvarer tæller kun, når indstillingen er slået til", () => {
    expect(powerLeadEffectFor("VOICEMAIL", ctx).countAttempt).toBe(true);
    expect(powerLeadEffectFor("VOICEMAIL", { ...ctx, amdMachineCountsAttempt: false }).countAttempt).toBe(false);
    expect(powerLeadEffectFor("VOICEMAIL", ctx).status).toBe("VOICEMAIL");
  });

  it("drop tæller ikke og venter kampagnens cooldown", () => {
    const e = powerLeadEffectFor("DROP_NO_AGENT", ctx);
    expect(e.countAttempt).toBe(false);
    expect(e.status).toBeNull();
    expect(e.eligibleAfterMs).toBe(2 * 60 * 60 * 1000);
  });

  it("usikkert AMD, overdial og teknisk fejl ⇒ kort genkø uden forsøg", () => {
    for (const r of ["AMD_UNCERTAIN_REQUEUE", "CANCELLED_OVERDIAL", "TECHNICAL"] as const) {
      const e = powerLeadEffectFor(r, ctx);
      expect(e.countAttempt).toBe(false);
      expect(e.eligibleAfterMs).toBe(600_000);
    }
  });

  it("forbundet ⇒ ingen systemeffekt", () => {
    expect(powerLeadEffectFor("CONNECTED", ctx).status).toBeNull();
  });
});
