import { describe, expect, it } from "vitest";
import {
  isPowerAgentDialable,
  reducePowerPresence,
  type PowerAgentServerState,
  type PowerPresenceReport,
} from "@/lib/power-dialer-presence";
import type { PowerPauseMode } from "@/lib/power-dialer-settings";

const NOW = new Date("2026-09-24T09:00:00.000Z");
const settings: { wrapUpSeconds: number; ringTimeoutSecs: number; pauseMode: PowerPauseMode } = {
  wrapUpSeconds: 0,
  ringTimeoutSecs: 25,
  pauseMode: "DRAIN",
};
const opts = { freshWindowMs: 30_000, reservationStaleMs: 30_000 };

function state(overrides: Partial<PowerAgentServerState> = {}): PowerAgentServerState {
  return {
    status: "ready",
    readySince: new Date(NOW.getTime() - 60_000),
    reservedAt: null,
    wrapUpUntil: null,
    drainUntil: null,
    clientInstanceId: "tab-a",
    lastHeartbeat: new Date(NOW.getTime() - 5_000),
    ...overrides,
  };
}

function report(overrides: Partial<PowerPresenceReport> = {}): PowerPresenceReport {
  return {
    clientInstanceId: "tab-a",
    intent: "ready",
    leadOpen: false,
    lineLive: false,
    webrtcReady: true,
    takeover: false,
    skipWrapUp: false,
    ...overrides,
  };
}

function next(prev: PowerAgentServerState | null, r: PowerPresenceReport, s = settings, now = NOW) {
  const d = reducePowerPresence(prev, r, s, now, opts);
  if (d.superseded) throw new Error("uventet superseded");
  return d.next;
}

describe("reducePowerPresence", () => {
  it("ny session bliver klar med readySince = nu", () => {
    const n = next(null, report({ takeover: true }));
    expect(n.status).toBe("ready");
    expect(n.readySince).toEqual(NOW);
  });

  it("klar forbliver klar og beholder readySince (længst ledig først)", () => {
    const prev = state();
    expect(next(prev, report()).readySince).toEqual(prev.readySince);
  });

  it("heartbeat «klar» overskriver ikke en frisk reservation (ringing)", () => {
    const prev = state({ status: "ringing", reservedAt: new Date(NOW.getTime() - 4_000) });
    expect(next(prev, report()).status).toBe("ringing");
  });

  it("forældet reservation uden samtale frigives", () => {
    const prev = state({ status: "ringing", reservedAt: new Date(NOW.getTime() - 45_000) });
    const d = reducePowerPresence(prev, report(), settings, NOW, opts);
    expect(d.superseded).toBe(false);
    if (d.superseded) return;
    expect(d.next.status).toBe("ready");
    expect(d.releasedReservation).toBe(true);
  });

  it("live linje ⇒ i samtale", () => {
    expect(next(state({ status: "ringing", reservedAt: NOW }), report({ lineLive: true })).status).toBe("talking");
  });

  it("efter samtale med åbent lead ⇒ efterbehandling (aldrig klar)", () => {
    const n = next(state({ status: "talking" }), report({ leadOpen: true }));
    expect(n.status).toBe("wrap_up");
    expect(n.wrapUpUntil).toBeNull();
  });

  it("åbent lead mens status er klar ⇒ efterbehandling", () => {
    expect(next(state(), report({ leadOpen: true })).status).toBe("wrap_up");
  });

  it("lead lukket med 0 sek. pause ⇒ straks klar", () => {
    const n = next(state({ status: "wrap_up" }), report());
    expect(n.status).toBe("ready");
    expect(n.readySince).toEqual(NOW);
  });

  it("lead lukket med 10 sek. pause ⇒ nedtælling, derefter klar", () => {
    const s10 = { ...settings, wrapUpSeconds: 10 };
    const n1 = next(state({ status: "wrap_up" }), report(), s10);
    expect(n1.status).toBe("wrap_up");
    expect(n1.wrapUpUntil?.getTime()).toBe(NOW.getTime() + 10_000);

    const later = new Date(NOW.getTime() + 11_000);
    const n2 = next(state({ status: "wrap_up", wrapUpUntil: n1.wrapUpUntil }), report(), s10, later);
    expect(n2.status).toBe("ready");
  });

  it("«Klar nu» springer pausen over", () => {
    const s30 = { ...settings, wrapUpSeconds: 30 };
    const prev = state({ status: "wrap_up", wrapUpUntil: new Date(NOW.getTime() + 25_000) });
    expect(next(prev, report({ skipWrapUp: true }), s30).status).toBe("ready");
  });

  it("pause (DRAIN) ⇒ draining i ringetid + 10 sek., derefter pause", () => {
    const n1 = next(state(), report({ intent: "pause" }));
    expect(n1.status).toBe("draining");
    expect(n1.drainUntil?.getTime()).toBe(NOW.getTime() + 35_000);

    const later = new Date(NOW.getTime() + 36_000);
    const n2 = next(state({ status: "draining", drainUntil: n1.drainUntil }), report({ intent: "pause" }), settings, later);
    expect(n2.status).toBe("paused");
  });

  it("pause (HANGUP_RINGING) ⇒ straks pause", () => {
    const n = next(state(), report({ intent: "pause" }), { ...settings, pauseMode: "HANGUP_RINGING" });
    expect(n.status).toBe("paused");
  });

  it("pause under samtale træder først i kraft efter efterbehandling", () => {
    expect(next(state({ status: "talking" }), report({ intent: "pause", lineLive: true })).status).toBe("talking");
    expect(next(state({ status: "talking" }), report({ intent: "pause", leadOpen: true })).status).toBe("wrap_up");
  });

  it("fortsæt efter pause ⇒ klar med ny readySince", () => {
    const n = next(state({ status: "paused", readySince: null }), report());
    expect(n.status).toBe("ready");
    expect(n.readySince).toEqual(NOW);
  });

  it("anden fane uden takeover mens ejeren er frisk ⇒ superseded", () => {
    const d = reducePowerPresence(state(), report({ clientInstanceId: "tab-b" }), settings, NOW, opts);
    expect(d.superseded).toBe(true);
  });

  it("takeover fra ny fane overtager sessionen", () => {
    const n = next(state(), report({ clientInstanceId: "tab-b", takeover: true }));
    expect(n.clientInstanceId).toBe("tab-b");
  });

  it("forældet ejer kan overtages uden takeover", () => {
    const prev = state({ lastHeartbeat: new Date(NOW.getTime() - 120_000) });
    expect(next(prev, report({ clientInstanceId: "tab-b" })).clientInstanceId).toBe("tab-b");
  });

  it("WebRTC ikke klar gemmes, så dispatch ikke tæller sælgeren med", () => {
    const n = next(state(), report({ webrtcReady: false }));
    expect(n.status).toBe("ready");
    expect(n.webrtcReady).toBe(false);
    expect(
      isPowerAgentDialable(
        { status: n.status, webrtcReady: n.webrtcReady, lastHeartbeat: NOW, wrapUpUntil: n.wrapUpUntil },
        NOW,
        30_000,
      ),
    ).toBe(false);
  });
});

describe("isPowerAgentDialable", () => {
  it("kræver klar, WebRTC, frisk heartbeat og udløbet efterbehandling", () => {
    const base = { status: "ready", webrtcReady: true, lastHeartbeat: NOW, wrapUpUntil: null };
    expect(isPowerAgentDialable(base, NOW, 30_000)).toBe(true);
    expect(isPowerAgentDialable({ ...base, status: "draining" }, NOW, 30_000)).toBe(false);
    expect(isPowerAgentDialable({ ...base, lastHeartbeat: new Date(NOW.getTime() - 31_000) }, NOW, 30_000)).toBe(false);
    expect(isPowerAgentDialable({ ...base, wrapUpUntil: new Date(NOW.getTime() + 1_000) }, NOW, 30_000)).toBe(false);
  });
});
