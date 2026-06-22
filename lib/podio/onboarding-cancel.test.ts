import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/podio/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/podio/client")>();
  return {
    ...actual,
    isPodioAppConfigured: vi.fn(() => true),
    findItemIdByExternalId: vi.fn(),
    getItem: vi.fn(),
    deleteItemByExternalId: vi.fn(),
    updateItemValues: vi.fn(),
    createItem: vi.fn(),
    resolveFieldExternalId: vi.fn(async () => "field"),
    resolveCategoryOptionId: vi.fn(async () => 1),
    setPodioFieldValue: vi.fn(),
  };
});

import { deleteItemByExternalId, findItemIdByExternalId, updateItemValues } from "@/lib/podio/client";
import { handleOnboardingMeetingCancelled, KUNDE_STADIE } from "@/lib/podio/customer-mapping";

describe("handleOnboardingMeetingCancelled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findItemIdByExternalId).mockImplementation(async (app, ext) => {
      if (app === "kunder") return 100;
      if (app === "processer" && ext.includes("-proc-")) return 200;
      return null;
    });
    vi.mocked(updateItemValues).mockResolvedValue(undefined);
    vi.mocked(deleteItemByExternalId).mockResolvedValue(undefined);
  });

  it("sætter kunde-stadie til Tabt/Annulleret", async () => {
    await handleOnboardingMeetingCancelled("lead-cancel-1");

    expect(updateItemValues).toHaveBeenCalledWith(
      "kunder",
      100,
      expect.any(Object),
    );
  });

  it("sletter alle kendte processer inkl. opfølgning", async () => {
    await handleOnboardingMeetingCancelled("lead-cancel-2");

    const deleted = vi.mocked(deleteItemByExternalId).mock.calls.map((c) => c[1]);
    expect(deleted).toContain("lead-cancel-2-proc-gecko");
    expect(deleted).toContain("lead-cancel-2-proc-kickoff-prep");
    expect(deleted).toContain("lead-cancel-2-proc-sms-flow");
    expect(deleted).toContain("lead-cancel-2-proc-sms-levering");
    expect(deleted).toContain("lead-cancel-2-proc-loom");
    expect(deleted).toContain("lead-cancel-2-proc-opsalg");
    expect(deleted).toContain("lead-cancel-2-proc-kickoff-opfoelgning");
  });

  it("bruger Tabt-stadie via advanceKundeStadie", async () => {
    await handleOnboardingMeetingCancelled("lead-cancel-3");
    expect(KUNDE_STADIE.tabt).toBe("Tabt/Annulleret");
  });
});
