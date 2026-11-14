import { describe, expect, it } from "vitest";
import { matchEmployeeForSeller, matchSellerForEmployee, type SellerForMatch } from "./employee-match";

const victor: SellerForMatch = { id: "u-victor", name: "Victor Lafargue", phone: "+4560177438", allioNativeEmployeeId: null };
const ernesto: SellerForMatch = { id: "u-ernesto", name: "Ernesto", phone: null, allioNativeEmployeeId: null };
const emil: SellerForMatch = { id: "u-emil", name: "Emil Tagiev", phone: null, allioNativeEmployeeId: null };

describe("matchSellerForEmployee (Allio → Leads)", () => {
  it("matcher på telefon før navn", () => {
    const seller = matchSellerForEmployee([victor, ernesto], { id: "e1", name: "Kalender 1", phone: "60 17 74 38" });
    expect(seller?.id).toBe("u-victor");
  });

  it("matcher på fuldt navn og på fornavn", () => {
    expect(matchSellerForEmployee([victor, emil], { id: "e1", name: "Emil Tagiev" })?.id).toBe("u-emil");
    expect(matchSellerForEmployee([victor, ernesto], { id: "e2", name: "Victor" })?.id).toBe("u-victor");
  });

  it("kobler ikke, når flere sælgere passer, eller sælgeren allerede har en kalender", () => {
    const victor2: SellerForMatch = { id: "u-victor2", name: "Victor Hansen", phone: null, allioNativeEmployeeId: null };
    expect(matchSellerForEmployee([victor, victor2], { id: "e1", name: "Victor" })).toBeNull();
    expect(
      matchSellerForEmployee([{ ...ernesto, allioNativeEmployeeId: "e-old" }], { id: "e1", name: "Ernesto" }),
    ).toBeNull();
  });

  it("kobler ikke, når intet passer", () => {
    expect(matchSellerForEmployee([victor, ernesto], { id: "e1", name: "Sofie" })).toBeNull();
  });
});

describe("matchEmployeeForSeller (Leads → Allio)", () => {
  const employees = [
    { id: "e-victor", name: "Victor" },
    { id: "e-ernesto", name: "Ernesto" },
    { id: "e-emil", name: "Emil Tagiev" },
  ];

  it("finder sælgerens eksisterende kalender", () => {
    expect(matchEmployeeForSeller(employees, emil, new Set())?.id).toBe("e-emil");
    expect(matchEmployeeForSeller(employees, victor, new Set())?.id).toBe("e-victor");
  });

  it("springer kalendere over, som en anden sælger har", () => {
    expect(matchEmployeeForSeller(employees, ernesto, new Set(["e-ernesto"]))).toBeNull();
  });
});
