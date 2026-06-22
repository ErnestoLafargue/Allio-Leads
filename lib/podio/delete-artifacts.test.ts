import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/podio/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/podio/client")>();
  return {
    ...actual,
    isPodioConfigured: vi.fn(() => true),
    isPodioAppConfigured: vi.fn(() => true),
    deleteItemByExternalId: vi.fn(),
  };
});

import { deleteItemByExternalId } from "@/lib/podio/client";
import { deleteAllPodioArtifactsForLead } from "@/lib/podio/customer-mapping";

describe("deleteAllPodioArtifactsForLead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deleteItemByExternalId).mockResolvedValue(true);
  });

  it("sletter processer, møder og kunde", async () => {
    await deleteAllPodioArtifactsForLead("lead-del-1");

    const deleted = vi.mocked(deleteItemByExternalId).mock.calls.map((c) => `${c[0]}:${c[1]}`);
    expect(deleted).toContain("processer:lead-del-1-proc-gecko");
    expect(deleted).toContain("processer:lead-del-1-proc-sms-kampagne-levering");
    expect(deleted).toContain("moeder:lead-del-1-onboarding");
    expect(deleted).toContain("moeder:lead-del-1-kickoff");
    expect(deleted).toContain("kunder:lead-del-1");
  });

  it("springer kunde over når skipKunde", async () => {
    await deleteAllPodioArtifactsForLead("lead-del-2", { skipKunde: true });

    const deleted = vi.mocked(deleteItemByExternalId).mock.calls.map((c) => `${c[0]}:${c[1]}`);
    expect(deleted.some((d) => d.startsWith("kunder:"))).toBe(false);
    expect(deleted).toContain("moeder:lead-del-2-onboarding");
  });
});
