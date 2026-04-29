import { describe, expect, it } from "vitest";
import {
  calculateUrgency,
  isDeadlineOverdue,
  isDeadlineSoon,
  sortTicketsByUrgency,
} from "./ticket-urgency";

const NOW = new Date("2026-04-29T12:00:00.000Z");

function inHours(h: number): Date {
  return new Date(NOW.getTime() + h * 3_600_000);
}

describe("calculateUrgency", () => {
  it("færdig ticket har laveste score (−999) selv med høj prioritet og overdue deadline", () => {
    const score = calculateUrgency(
      { priority: "haster", status: "done", deadline: inHours(-48) },
      NOW,
    );
    expect(score).toBe(-999);
  });

  it("overskredet deadline ligger altid over alt aktivt arbejde", () => {
    const overdueLow = calculateUrgency(
      { priority: "naar_tiden_passer", status: "open", deadline: inHours(-1) },
      NOW,
    );
    const futureHigh = calculateUrgency(
      { priority: "haster", status: "open", deadline: inHours(2) },
      NOW,
    );
    expect(overdueLow).toBeGreaterThan(futureHigh);
  });

  it("jo længere overskredet, jo højere score", () => {
    const a = calculateUrgency({ priority: "normal", status: "open", deadline: inHours(-1) }, NOW);
    const b = calculateUrgency({ priority: "normal", status: "open", deadline: inHours(-48) }, NOW);
    expect(b).toBeGreaterThan(a);
  });

  it("normal +1t skal slå snarest_muligt +14d (deadlinepres dominerer)", () => {
    const normalSoon = calculateUrgency(
      { priority: "normal", status: "open", deadline: inHours(1) },
      NOW,
    );
    const snarestFar = calculateUrgency(
      { priority: "snarest_muligt", status: "open", deadline: inHours(24 * 14) },
      NOW,
    );
    expect(normalSoon).toBeGreaterThan(snarestFar);
  });

  it("ingen deadline ligger lavere end samme prioritet med deadline >120t (ingen pres)", () => {
    const noDeadline = calculateUrgency(
      { priority: "haster", status: "open", deadline: null },
      NOW,
    );
    const farFuture = calculateUrgency(
      { priority: "haster", status: "open", deadline: inHours(24 * 30) },
      NOW,
    );
    expect(farFuture).toBeGreaterThan(noDeadline);
  });

  it("ingen deadline = basePriority − 20", () => {
    expect(
      calculateUrgency({ priority: "haster", status: "open", deadline: null }, NOW),
    ).toBe(80);
    expect(
      calculateUrgency({ priority: "naar_tiden_passer", status: "open", deadline: null }, NOW),
    ).toBe(-10);
  });

  it("aktiv ticket med deadline i dag har stort deadlinepres", () => {
    const score = calculateUrgency(
      { priority: "normal", status: "in_progress", deadline: inHours(2) },
      NOW,
    );
    // base 40 + max(0, 120 − 2) = 158
    expect(score).toBe(158);
  });
});

describe("sortTicketsByUrgency", () => {
  it("sorterer overdue → kort deadline → lang deadline → ingen deadline → done", () => {
    const tickets = [
      { id: "future-haster", priority: "haster", status: "open", deadline: inHours(72) },
      { id: "no-deadline", priority: "haster", status: "open", deadline: null },
      { id: "done-haster", priority: "haster", status: "done", deadline: inHours(-1) },
      { id: "overdue", priority: "normal", status: "open", deadline: inHours(-1) },
      { id: "soon", priority: "normal", status: "open", deadline: inHours(2) },
    ] as const;
    const order = sortTicketsByUrgency(tickets, NOW).map((t) => t.id);
    expect(order).toEqual(["overdue", "soon", "future-haster", "no-deadline", "done-haster"]);
  });

  it("er stabil ved lige scores", () => {
    const a = { id: "a", priority: "normal", status: "open", deadline: null } as const;
    const b = { id: "b", priority: "normal", status: "open", deadline: null } as const;
    const out = sortTicketsByUrgency([a, b], NOW).map((t) => t.id);
    expect(out).toEqual(["a", "b"]);
  });
});

describe("isDeadlineOverdue / isDeadlineSoon", () => {
  it("overdue når deadline er i fortiden", () => {
    expect(isDeadlineOverdue(inHours(-1), NOW)).toBe(true);
    expect(isDeadlineOverdue(inHours(1), NOW)).toBe(false);
    expect(isDeadlineOverdue(null, NOW)).toBe(false);
  });

  it("soon når deadline er inden for 24t (men ikke overdue)", () => {
    expect(isDeadlineSoon(inHours(1), NOW)).toBe(true);
    expect(isDeadlineSoon(inHours(24), NOW)).toBe(true);
    expect(isDeadlineSoon(inHours(25), NOW)).toBe(false);
    expect(isDeadlineSoon(inHours(-1), NOW)).toBe(false);
    expect(isDeadlineSoon(null, NOW)).toBe(false);
  });
});
