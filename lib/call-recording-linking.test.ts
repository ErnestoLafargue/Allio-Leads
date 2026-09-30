import { describe, expect, it } from "vitest";
import {
  CALL_RECORDING_PIPELINE,
  initialPipelineStatus,
  matchCallAttempt,
  outcomeWindowEnd,
  pickCallOutcome,
  recordingDirection,
  resolveRecordingAgent,
} from "./call-recording-linking";

const OURS = new Set(["+4535151167", "+4535154630"]);

describe("recordingDirection", () => {
  it("udgående når from er vores nummer — kunden er to", () => {
    expect(recordingDirection("+4535151167", "+4553577020", OURS)).toEqual({
      direction: "outbound",
      customerNumber: "+4553577020",
    });
  });

  it("indgående når to er vores nummer — normaliserer 8-cifret kundenummer", () => {
    expect(recordingDirection("53577020", "+4535154630", OURS)).toEqual({
      direction: "inbound",
      customerNumber: "+4553577020",
    });
  });

  it("ukendt når ingen af numrene er vores", () => {
    expect(recordingDirection("+4511111111", "+4522222222", OURS)).toEqual({
      direction: "unknown",
      customerNumber: null,
    });
  });
});

describe("resolveRecordingAgent", () => {
  const base = {
    connectionId: null as string | null,
    userIdByConnectionId: new Map([["conn-current", "user-a"]]),
    connectionNameById: new Map([
      ["conn-current", "allioagentaaaa"],
      ["conn-old", "allioagentbbbb"],
      ["conn-powerdialer", "CCAPP"],
    ]),
    userIdByConnectionName: new Map([["allioagentbbbb", "user-b"]]),
    dialerAgentUserId: null as string | null,
    activityUserId: null as string | null,
    attemptUserId: null as string | null,
  };

  it("bruger brugerens nuværende forbindelse først", () => {
    expect(resolveRecordingAgent({ ...base, connectionId: "conn-current" })).toEqual({
      agentUserId: "user-a",
      agentMatch: "CONNECTION",
    });
  });

  it("falder tilbage til forbindelsens navn for gamle forbindelser", () => {
    expect(resolveRecordingAgent({ ...base, connectionId: "conn-old" })).toEqual({
      agentUserId: "user-b",
      agentMatch: "CONNECTION_NAME",
    });
  });

  it("power dialer: sælger fra DialerCallLog", () => {
    expect(
      resolveRecordingAgent({
        ...base,
        connectionId: "conn-powerdialer",
        dialerAgentUserId: "user-c",
        activityUserId: "user-d",
      }),
    ).toEqual({ agentUserId: "user-c", agentMatch: "DIALER_LOG" });
  });

  it("aktivitetens og opkaldsforsøgets bruger som sidste udvej, ellers NONE", () => {
    expect(
      resolveRecordingAgent({ ...base, activityUserId: "user-d", attemptUserId: "user-e" }),
    ).toEqual({ agentUserId: "user-d", agentMatch: "ACTIVITY" });
    expect(resolveRecordingAgent({ ...base, attemptUserId: "user-e" })).toEqual({
      agentUserId: "user-e",
      agentMatch: "CALL_ATTEMPT",
    });
    expect(resolveRecordingAgent(base)).toEqual({ agentUserId: null, agentMatch: "NONE" });
  });
});

describe("matchCallAttempt", () => {
  const startedAt = new Date("2026-09-26T10:00:00Z");
  const attempt = (leadId: string, userId: string, iso: string) => ({
    leadId,
    userId,
    createdAt: new Date(iso),
  });

  it("vælger leadet sælgeren ringede op fra lige før optagelsen (dubletter med samme nummer)", () => {
    const attempts = [
      attempt("lead-old-duplicate", "agent", "2026-09-20T09:00:00Z"),
      attempt("lead-called", "agent", "2026-09-26T09:59:20Z"),
    ];
    expect(matchCallAttempt(attempts, { startedAt, agentUserId: "agent" })).toEqual({
      leadId: "lead-called",
      userId: "agent",
    });
  });

  it("kun forsøg fra optagelsens egen sælger, når den er kendt", () => {
    const attempts = [attempt("lead-a", "someone-else", "2026-09-26T09:59:30Z")];
    expect(matchCallAttempt(attempts, { startedAt, agentUserId: "agent" })).toBeNull();
    expect(matchCallAttempt(attempts, { startedAt, agentUserId: null })).toEqual({
      leadId: "lead-a",
      userId: "someone-else",
    });
  });

  it("intet match uden for vinduet eller når to leads er i spil", () => {
    expect(
      matchCallAttempt([attempt("lead-a", "agent", "2026-09-26T09:56:00Z")], {
        startedAt,
        agentUserId: "agent",
      }),
    ).toBeNull();
    expect(
      matchCallAttempt(
        [
          attempt("lead-a", "agent", "2026-09-26T09:59:00Z"),
          attempt("lead-b", "agent", "2026-09-26T09:59:40Z"),
        ],
        { startedAt, agentUserId: "agent" },
      ),
    ).toBeNull();
  });
});

describe("outcomeWindowEnd", () => {
  const ended = new Date("2026-09-26T10:00:00Z");

  it("30 min efter opkaldets slut", () => {
    expect(outcomeWindowEnd(ended, null).toISOString()).toBe("2026-09-26T10:30:00.000Z");
  });

  it("stopper ved næste optagede opkald på samme lead", () => {
    const next = new Date("2026-09-26T10:05:00Z");
    expect(outcomeWindowEnd(ended, next).toISOString()).toBe("2026-09-26T10:05:00.000Z");
  });
});

describe("pickCallOutcome", () => {
  const window = {
    start: new Date("2026-09-26T10:00:00Z"),
    end: new Date("2026-09-26T10:30:00Z"),
  };
  const log = (status: string, userId: string | null, iso: string) => ({
    status,
    userId,
    createdAt: new Date(iso),
  });

  it("seneste udfald i vinduet vinder (rettelse efter opkaldet)", () => {
    const logs = [
      log("CALLBACK_SCHEDULED", "agent", "2026-09-26T10:02:00Z"),
      log("MEETING_BOOKED", "agent", "2026-09-26T10:04:00Z"),
    ];
    expect(pickCallOutcome(logs, window, "agent")?.status).toBe("MEETING_BOOKED");
  });

  it("ignorerer systemets auto-udfald og udfald uden for vinduet", () => {
    const logs = [
      log("NEW", null, "2026-09-26T10:03:00Z"),
      log("NOT_INTERESTED", "agent", "2026-09-26T09:59:00Z"),
      log("MEETING_BOOKED", "agent", "2026-09-26T10:30:00Z"),
    ];
    expect(pickCallOutcome(logs, window, "agent")).toBeNull();
  });

  it("foretrækker opkaldets egen sælger frem for andres udfald", () => {
    const logs = [
      log("NOT_INTERESTED", "agent", "2026-09-26T10:01:00Z"),
      log("MEETING_BOOKED", "admin", "2026-09-26T10:10:00Z"),
    ];
    expect(pickCallOutcome(logs, window, "agent")?.status).toBe("NOT_INTERESTED");
    expect(pickCallOutcome(logs, window, null)?.status).toBe("MEETING_BOOKED");
  });
});

describe("initialPipelineStatus", () => {
  it("springer korte optagelser og samtaler uden kontakt over", () => {
    expect(initialPipelineStatus(9, "MEETING_BOOKED")).toBe(CALL_RECORDING_PIPELINE.SKIPPED_SHORT);
    expect(initialPipelineStatus(40, "VOICEMAIL")).toBe(
      CALL_RECORDING_PIPELINE.SKIPPED_NO_CONVERSATION,
    );
    expect(initialPipelineStatus(40, null)).toBe(CALL_RECORDING_PIPELINE.NEW);
    expect(initialPipelineStatus(300, "MEETING_BOOKED")).toBe(CALL_RECORDING_PIPELINE.NEW);
  });

  it("markerer app-optagelser, der også findes som komplet profil-optagelse, som dubletter", () => {
    expect(initialPipelineStatus(300, "MEETING_BOOKED", true)).toBe(CALL_RECORDING_PIPELINE.SKIPPED_DUPLICATE);
  });
});
