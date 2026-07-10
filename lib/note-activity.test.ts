import { describe, expect, it } from "vitest";
import { buildNoteUpdateSummary, computeNoteDiff } from "@/lib/note-activity";

describe("computeNoteDiff", () => {
  it("returns empty when unchanged", () => {
    expect(computeNoteDiff("hello", "hello")).toEqual({ added: "", removed: "" });
  });

  it("detects pure append", () => {
    expect(computeNoteDiff("Ring onsdag", "Ring onsdag. Møde booket")).toEqual({
      added: ". Møde booket",
      removed: "",
    });
  });

  it("detects pure deletion", () => {
    expect(computeNoteDiff("Ring onsdag. Møde", "Ring onsdag.")).toEqual({
      added: "",
      removed: " Møde",
    });
  });

  it("detects replacement when words share partial overlap", () => {
    expect(computeNoteDiff("Ring onsdag", "Ring fredag")).toEqual({
      added: "fre",
      removed: "ons",
    });
  });

  it("detects full word replacement", () => {
    expect(computeNoteDiff("Linje et", "Linje to")).toEqual({
      added: "to",
      removed: "et",
    });
  });

  it("handles empty to text", () => {
    expect(computeNoteDiff("", "Ny note")).toEqual({
      added: "Ny note",
      removed: "",
    });
  });
});

describe("buildNoteUpdateSummary", () => {
  it("uses tilføjede for pure append", () => {
    expect(buildNoteUpdateSummary("Emil", { added: "x", removed: "" })).toBe(
      "Emil tilføjede til noter",
    );
  });

  it("uses ændrede for replacement", () => {
    expect(buildNoteUpdateSummary("Emil", { added: "fredag", removed: "onsdag" })).toBe(
      "Emil ændrede i noterne",
    );
  });
});
