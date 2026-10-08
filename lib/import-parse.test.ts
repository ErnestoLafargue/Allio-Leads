import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { looksLikeNumericId, looksLikeUrlOrDomain, parseImportFile } from "./import-parse";

describe("looksLikeUrlOrDomain", () => {
  it("accepterer URL og host, afviser link-labels", () => {
    expect(looksLikeUrlOrDomain("https://firma.dk")).toBe(true);
    expect(looksLikeUrlOrDomain("firma.dk")).toBe(true);
    expect(looksLikeUrlOrDomain("ok")).toBe(false);
    expect(looksLikeUrlOrDomain("link")).toBe(false);
    expect(looksLikeUrlOrDomain("")).toBe(false);
  });
});

describe("looksLikeNumericId", () => {
  it("genkender CVR/telefon", () => {
    expect(looksLikeNumericId("40738738")).toBe(true);
    expect(looksLikeNumericId("45 12 34 56 78")).toBe(true);
    expect(looksLikeNumericId("ok")).toBe(false);
  });
});

describe("parseImportFile hyperlinks", () => {
  it("bruger https-target når display-tekst er «ok»", async () => {
    const ws: XLSX.WorkSheet = {
      A1: { t: "s", v: "Domæne" },
      A2: { t: "s", v: "ok", w: "ok", l: { Target: "https://firma.dk/" } },
      A3: { t: "s", v: "ok", w: "ok", l: { Target: "https://anden.dk" } },
      B1: { t: "s", v: "Virksomhedstype" },
      B2: { t: "s", v: "Klinik" },
      B3: { t: "s", v: "Frisør" },
      "!ref": "A1:B3",
    };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const parsed = await parseImportFile(blob, "EasyPractice_test.xlsx");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]["Domæne"]).toBe("https://firma.dk/");
    expect(parsed.rows[1]["Domæne"]).toBe("https://anden.dk");
  });

  it("bevarer CVR-tal selv når cellen har virk-hyperlink", async () => {
    const ws: XLSX.WorkSheet = {
      A1: { t: "s", v: "CVR" },
      A2: {
        t: "s",
        v: "40738738",
        w: "40738738",
        l: { Target: "https://datacvr.virk.dk/data/visenhed?id=40738738" },
      },
      "!ref": "A1:A2",
    };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const parsed = await parseImportFile(blob, "cvr.xlsx");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows[0]["CVR"]).toBe("40738738");
  });

  it("bevarer display-tekst der allerede er et domæne", async () => {
    const ws: XLSX.WorkSheet = {
      A1: { t: "s", v: "Domæne" },
      A2: {
        t: "s",
        v: "firma.dk",
        w: "firma.dk",
        l: { Target: "https://www.firma.dk/path" },
      },
      "!ref": "A1:A2",
    };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const parsed = await parseImportFile(blob, "plain.xlsx");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows[0]["Domæne"]).toBe("firma.dk");
  });
});
