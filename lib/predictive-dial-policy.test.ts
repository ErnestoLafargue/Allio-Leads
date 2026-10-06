import { describe, expect, it } from "vitest";
import type { DialPhonePriority } from "@/lib/lead-phones";
import {
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

  // Kunden lægger på: videre til næste, og det er B's nummer der ringes.
  const remote = predictiveActionAfterRemoteEnd({
    hadLive: true,
    autoOutcome: null,
    canFailover: true,
  });
  if (remote.type === "advance") openLead(b);

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
    const wrongNumber = dials.filter((d) => d.leadId === "lead-b" && !sameDialTarget(d.phone, shownOnB));

    expect(remote).toEqual({ type: "advance", outcome: null });
    expect(agentRedials).toEqual([]);
    expect(wrongNumber).toEqual([]);
    expect(dials.map((d) => `${d.leadId}:${d.phone}`)).toEqual([
      "lead-a:11111111",
      "lead-b:22222222",
      "lead-a:11111111",
      "lead-b:22222222",
    ]);
    expect(dials.some((d) => d.reason === "form-synced" && d.phone === "22222222")).toBe(true);
  });

  it("kunde der lægger på under samtale går videre og ringer ikke samme leads andet nummer", () => {
    expect(
      predictiveActionAfterRemoteEnd({ hadLive: true, autoOutcome: null, canFailover: true }),
    ).toEqual({ type: "advance", outcome: null });
  });

  it("ubesvaret uden samtale må stadig prøve leadets andet nummer før næste", () => {
    expect(
      predictiveActionAfterRemoteEnd({ hadLive: false, autoOutcome: "NOT_HOME", canFailover: true }),
    ).toEqual({ type: "failover" });
  });
});
