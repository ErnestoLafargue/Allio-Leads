import { describe, expect, it } from "vitest";
import { hardBlocksForMeeting, softBlocksForMeeting } from "./availability";
import {
  multiSellerSlots,
  pickSellerForMeeting,
  placeFloatingMeetings,
  type SellerCalendar,
} from "./sellers";

// Fredag 13/11/2026 (vintertid: UTC = lokal − 1t)
const DAY = "2026-11-13";
const at = (h: number, m = 0) => Date.UTC(2026, 10, 13, h - 1, m);

function seller(sellerId: string, physicalStarts: number[] = []): SellerCalendar {
  return {
    sellerId,
    hardBlocks: physicalStarts.flatMap((s) => hardBlocksForMeeting(s, "PHYSICAL")),
    softBlocks: physicalStarts.flatMap((s) => softBlocksForMeeting(s, "PHYSICAL")),
    physicalStartsMs: [...physicalStarts],
  };
}

const ledige = (sellers: SellerCalendar[], target = 4) =>
  multiSellerSlots(DAY, "PHYSICAL", sellers, { physicalMeetingsTarget: target })
    .filter((s) => s.available)
    .map((s) => `${s.time} ${s.sellerId}`);

describe("flere kørende sælgere", () => {
  it("begge tomme: de 8 faste tider, alle til Victor (prioritet 1)", () => {
    expect(ledige([seller("victor"), seller("ernesto")])).toEqual([
      "09:00 victor",
      "09:30 victor",
      "11:30 victor",
      "12:00 victor",
      "14:00 victor",
      "14:30 victor",
      "16:30 victor",
      "17:00 victor",
    ]);
  });

  it("Victor fyldt (09:00, 13:00, 15:30) — dagen er stadig åben, alt går til Ernesto", () => {
    const victor = seller("victor", [at(9), at(13), at(15, 30)]);
    expect(ledige([victor, seller("ernesto")])).toEqual([
      "09:00 ernesto",
      "09:30 ernesto",
      "11:30 ernesto",
      "12:00 ernesto",
      "14:00 ernesto",
      "14:30 ernesto",
      "16:30 ernesto",
      "17:00 ernesto",
    ]);
  });

  it("Victor har 09:00: 09:00/09:30 går til Ernesto, resten til Victor", () => {
    const slots = ledige([seller("victor", [at(9)]), seller("ernesto")]);
    expect(slots).toContain("09:00 ernesto");
    expect(slots).toContain("09:30 ernesto");
    expect(slots).toContain("11:30 victor");
    expect(slots).toContain("17:00 victor");
  });

  it("samme tid kan bookes to gange — én til hver sælger", () => {
    const victor = seller("victor");
    const ernesto = seller("ernesto");
    expect(pickSellerForMeeting(at(9), DAY, "PHYSICAL", [victor, ernesto], { physicalMeetingsTarget: 4 })).toBe("victor");
    const victorBooked = seller("victor", [at(9)]);
    expect(pickSellerForMeeting(at(9), DAY, "PHYSICAL", [victorBooked, ernesto], { physicalMeetingsTarget: 4 })).toBe("ernesto");
    const bothBooked = [victorBooked, seller("ernesto", [at(9)])];
    expect(pickSellerForMeeting(at(9), DAY, "PHYSICAL", bothBooked, { physicalMeetingsTarget: 4 })).toBeNull();
    expect(ledige(bothBooked).some((s) => s.startsWith("09:00"))).toBe(false);
  });

  it("lukket sælger (fx onsdag pr. sælger) tæller ikke med", () => {
    const sellers = [seller("victor"), seller("ernesto")];
    const slots = multiSellerSlots(DAY, "PHYSICAL", sellers, {
      physicalMeetingsTarget: 4,
      forSeller: (id) => ({ closed: id === "victor" }),
    }).filter((s) => s.available);
    expect(slots.every((s) => s.sellerId === "ernesto")).toBe(true);
    expect(slots).toHaveLength(8);
  });

  it("uden sælgere er der ingen tider", () => {
    expect(ledige([])).toEqual([]);
  });
});

describe("møder uden sælger («Ingen tildelt») optager én plads", () => {
  it("ét møde 09:00 uden sælger lægges hos Victor — 09:00 kan stadig bookes hos Ernesto", () => {
    const placed = placeFloatingMeetings([seller("victor"), seller("ernesto")], [
      { startMs: at(9), meetingType: "PHYSICAL" },
    ]);
    expect(placed[0]!.physicalStartsMs).toEqual([at(9)]);
    expect(placed[1]!.physicalStartsMs).toEqual([]);
    expect(ledige(placed)).toContain("09:00 ernesto");
  });

  it("to møder 09:00 uden sælger fylder begge — 09:00 er væk", () => {
    const placed = placeFloatingMeetings([seller("victor"), seller("ernesto")], [
      { startMs: at(9), meetingType: "PHYSICAL" },
      { startMs: at(9), meetingType: "PHYSICAL" },
    ]);
    expect(placed[1]!.physicalStartsMs).toEqual([at(9)]);
    expect(ledige(placed).some((s) => s.startsWith("09:00"))).toBe(false);
  });

  it("ændrer ikke de oprindelige kalendere", () => {
    const victor = seller("victor");
    placeFloatingMeetings([victor], [{ startMs: at(9), meetingType: "PHYSICAL" }]);
    expect(victor.physicalStartsMs).toEqual([]);
    expect(victor.hardBlocks).toEqual([]);
  });
});

describe("pickSellerForMeeting uden for gitteret", () => {
  it("admin-tid 10:15 gives til første sælger med plads", () => {
    const victor = seller("victor", [at(9)]);
    expect(pickSellerForMeeting(at(10, 15), DAY, "PHYSICAL", [victor, seller("ernesto")])).toBe("ernesto");
  });
});
