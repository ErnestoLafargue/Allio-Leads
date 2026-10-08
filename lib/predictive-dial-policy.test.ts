import { describe, expect, it } from "vitest";
import { dialNumberMenu, showsDialNumberMenu, type DialPhonePriority } from "@/lib/lead-phones";
import {
  dialActionForMenuChoice,
  dialPhoneForOpenLead,
  predictiveActionAfterRemoteEnd,
  predictiveAutoStartKey,
  sameDialTarget,
  shouldPredictiveAutoStart,
} from "@/lib/predictive-dial-policy";

type Lead = { id: string; phone: string; privatePhone?: string | null };

type Dial = { leadId: string; phone: string; reason: string };

/**
 * Samme beslutninger som arbejdsfladen, uden Telnyx og uden rigtige kunder.
 * Stale formularnummer er det, der skete efter tilbagekald: nyt lead åbnet, gammelt nummer stadig i felterne.
 */
function runSmoke(priority: DialPhonePriority) {
  const a: Lead = { id: "lead-a", phone: "11111111", privatePhone: "10101010" };
  const b: Lead = { id: "lead-b", phone: "22222222", privatePhone: null };
  const dials: Dial[] = [];
  let open: Lead | null = a;
  let formPhone = dialPhoneForOpenLead(a, priority);
  let suppressed: string | null = null;
  let autoKey: string | null = null;
  let slot: "primary" | "failover" = "primary";
  let lineBusy = false;

  const tryAutoStart = (reason: string) => {
    if (!open) return;
    const record = dialPhoneForOpenLead(open, priority);
    const key = predictiveAutoStartKey(open.id, slot, true);
    const start = shouldPredictiveAutoStart({
      autoStart: true,
      audioReady: true,
      hasNumber: formPhone.trim().length > 0,
      numberAllowed: true,
      numberMatchesOpenLead: sameDialTarget(formPhone, record),
      suppressedLeadId: suppressed,
      leadId: open.id,
      lineBusy,
      previousKey: autoKey,
      key,
    });
    if (!start) return;
    autoKey = key;
    lineBusy = true;
    dials.push({ leadId: open.id, phone: record, reason });
  };

  const openLead = (lead: Lead, staleFormPhone?: string) => {
    open = lead;
    slot = "primary";
    suppressed = null;
    autoKey = null;
    lineBusy = false;
    formPhone = staleFormPhone ?? dialPhoneForOpenLead(lead, priority);
    tryAutoStart("open");
    if (!sameDialTarget(formPhone, dialPhoneForOpenLead(lead, priority))) {
      formPhone = dialPhoneForOpenLead(lead, priority);
      tryAutoStart("form-synced");
    }
  };

  tryAutoStart("first");

  // Agenten lægger selv på. Samme kundebillede. Må ikke ringe igen, heller ikke hvis formularen omskrives.
  lineBusy = false;
  suppressed = open.id;
  formPhone = "11111111";
  tryAutoStart("agent-hangup");
  formPhone = "+45 11 11 11 11";
  tryAutoStart("agent-hangup-reformat");

  // Kunden lægger på efter en samtale: bliv på samme kunde. Intet udfald, intet nyt opkald.
  const remote = predictiveActionAfterRemoteEnd({
    hadLive: true,
    autoOutcome: null,
    canFailover: true,
  });
  lineBusy = false;
  suppressed = open.id;
  tryAutoStart("customer-hangup-after-talk");

  // Tilbagekald: billedet åbner B, men formularen har stadig A's nummer i ét render.
  openLead(a);
  lineBusy = false;
  suppressed = null;
  autoKey = null;
  openLead(b, dialPhoneForOpenLead(a, priority));

  return { dials, remote, shownOnB: dialPhoneForOpenLead(b, priority) };
}

describe("predictive dialer smoke", () => {
  it("ringer det åbne leads nummer, ikke det forrige, og ringer ikke samme kunde igen når agenten lægger på", () => {
    const priority: DialPhonePriority = "COMPANY_FIRST";
    const { dials, remote, shownOnB } = runSmoke(priority);

    const agentRedials = dials.filter((d) => d.reason.startsWith("agent-hangup"));
    const afterTalk = dials.filter((d) => d.reason === "customer-hangup-after-talk");
    const wrongNumber = dials.filter((d) => d.leadId === "lead-b" && !sameDialTarget(d.phone, shownOnB));

    expect(remote).toEqual({ type: "stay" });
    expect(agentRedials).toEqual([]);
    expect(afterTalk).toEqual([]);
    expect(wrongNumber).toEqual([]);
    expect(dials.map((d) => `${d.leadId}:${d.phone}`)).toEqual([
      "lead-a:11111111",
      "lead-a:11111111",
      "lead-b:22222222",
    ]);
    expect(dials.some((d) => d.reason === "form-synced" && d.phone === "22222222")).toBe(true);
  });

  it("kunde der lægger på efter en samtale bliver på billedet uden udfald", () => {
    expect(
      predictiveActionAfterRemoteEnd({ hadLive: true, autoOutcome: null, canFailover: true }),
    ).toEqual({ type: "stay" });
    expect(
      predictiveActionAfterRemoteEnd({ hadLive: true, autoOutcome: "NOT_HOME", canFailover: false }),
    ).toEqual({ type: "stay" });
  });

  it("opdaget telefonsvarer ringer automatisk næste nummer, også når svareren nåede at forbinde", () => {
    const detected = predictiveActionAfterRemoteEnd({
      hadLive: true,
      autoOutcome: "VOICEMAIL",
      canFailover: true,
    });
    expect(detected).toEqual({ type: "failover" });
    expect(
      predictiveActionAfterRemoteEnd({ hadLive: false, autoOutcome: "VOICEMAIL", canFailover: true }),
    ).toEqual({ type: "failover" });
    expect(
      predictiveActionAfterRemoteEnd({ hadLive: false, autoOutcome: "VOICEMAIL", canFailover: false }),
    ).toEqual({ type: "advance", outcome: "VOICEMAIL" });
    expect(
      predictiveActionAfterRemoteEnd({ hadLive: true, autoOutcome: "VOICEMAIL", canFailover: false }),
    ).toEqual({ type: "advance", outcome: "VOICEMAIL" });

    const leadId = "lead-a";
    const nextKey = predictiveAutoStartKey(leadId, "failover", true);
    expect(
      shouldPredictiveAutoStart({
        autoStart: true,
        audioReady: true,
        hasNumber: true,
        numberAllowed: true,
        numberMatchesOpenLead: true,
        suppressedLeadId: null,
        leadId,
        lineBusy: false,
        previousKey: null,
        key: nextKey,
      }),
    ).toBe(true);
  });

  it("hørt telefonsvarer: rullemenuen lader sælgeren ringe det andet nummer bagefter", () => {
    const priority: DialPhonePriority = "COMPANY_FIRST";
    const lead: Lead = { id: "lead-a", phone: "+4536179018", privatePhone: "22112211" };
    const menu = dialNumberMenu(lead.phone, lead.privatePhone, priority);
    const primary = dialPhoneForOpenLead(lead, priority);

    expect(showsDialNumberMenu(menu)).toBe(true);
    expect(menu.map((item) => item.label)).toEqual([
      "Virksomhed · +4536179018",
      "Privat · 22112211",
    ]);
    expect(showsDialNumberMenu(dialNumberMenu(lead.phone, lead.phone, priority))).toBe(false);

    const undetected = predictiveActionAfterRemoteEnd({
      hadLive: true,
      autoOutcome: null,
      canFailover: true,
    });
    expect(undetected).toEqual({ type: "stay" });
    const detected = predictiveActionAfterRemoteEnd({
      hadLive: true,
      autoOutcome: "VOICEMAIL",
      canFailover: true,
    });
    expect(detected).toEqual({ type: "failover" });

    const afterHangup = dialActionForMenuChoice({
      menu,
      primaryRaw: primary,
      currentRaw: primary,
      selectedRaw: menu[1]!.raw,
      lineBusy: false,
    });
    expect(afterHangup).toEqual({
      type: "dial",
      phone: "22112211",
      usingAlternate: true,
      hangUpFirst: false,
    });
    expect(
      dialActionForMenuChoice({
        menu,
        primaryRaw: primary,
        currentRaw: primary,
        selectedRaw: "99887766",
        lineBusy: false,
      }),
    ).toEqual({ type: "keep" });
    expect(showsDialNumberMenu(menu)).toBe(true);

    const whileSecondRings = dialActionForMenuChoice({
      menu,
      primaryRaw: primary,
      currentRaw: menu[1]!.raw,
      selectedRaw: primary,
      lineBusy: true,
    });
    expect(whileSecondRings).toEqual({
      type: "dial",
      phone: primary,
      usingAlternate: false,
      hangUpFirst: true,
    });
    expect(
      dialActionForMenuChoice({
        menu,
        primaryRaw: primary,
        currentRaw: menu[1]!.raw,
        selectedRaw: menu[1]!.raw,
        lineBusy: true,
      }),
    ).toEqual({ type: "keep" });

    const choice = afterHangup.type === "dial" ? afterHangup : null;
    const suppressed = lead.id;
    const slot = choice?.usingAlternate ? "failover" : "primary";
    const previousKey = predictiveAutoStartKey(lead.id, "primary", true);
    const key = predictiveAutoStartKey(lead.id, slot, true);
    const auto = shouldPredictiveAutoStart({
      autoStart: true,
      audioReady: true,
      hasNumber: true,
      numberAllowed: true,
      numberMatchesOpenLead: true,
      suppressedLeadId: suppressed,
      leadId: lead.id,
      lineBusy: false,
      previousKey,
      key,
    });
    expect(auto).toBe(false);

    const manualDial = choice!.phone;
    expect(sameDialTarget(manualDial, "22112211")).toBe(true);
    expect(sameDialTarget(manualDial, primary)).toBe(false);
  });

  it("ubesvaret uden samtale må stadig prøve leadets andet nummer før næste", () => {
    expect(
      predictiveActionAfterRemoteEnd({ hadLive: false, autoOutcome: "NOT_HOME", canFailover: true }),
    ).toEqual({ type: "failover" });
  });
});
