import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { copenhagenDayKey } from "@/lib/copenhagen-day";
import { computeScoreboardForDay } from "@/lib/scoreboard-day";
import { warnIfScoreboardUserTallyInconsistent } from "@/lib/lead-outcome-log";

/**
 * GET /api/users/leaderboard?dayKey=YYYY-MM-DD
 *
 * Dags-scoreboard. Alle ser møder/samtaler/kontakter; admin får derudover
 * tidsmålinger (login-/dialer-tid, gns. samtaletid, buyrate) og fordeling
 * pr. kampagne. Beregning ligger i lib/scoreboard-day.ts (delt med Plecto-eksport).
 */
export async function GET(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  try {
    const searchParams = new URL(req.url).searchParams;
    const requestedDayKey = searchParams.get("dayKey")?.trim() ?? "";
    const dayKey =
      /^\d{4}-\d{2}-\d{2}$/.test(requestedDayKey) ? requestedDayKey : copenhagenDayKey();
    const todayKey = copenhagenDayKey();
    const isAdmin = session.user.role === "ADMIN";

    const board = await computeScoreboardForDay(dayKey);

    const rows = board.rows.map((r) => {
      warnIfScoreboardUserTallyInconsistent(r.userId, r.meetings, r.conversations, r.contacts);
      const base = {
        userId: r.userId,
        name: r.name,
        username: r.username,
        role: r.role,
        meetings: r.meetings,
        conversations: r.conversations,
        contacts: r.contacts,
      };
      if (!isAdmin) return base;
      return {
        ...base,
        talkSeconds: r.talkSeconds,
        loginSeconds: r.loginSeconds,
        dialerSeconds: r.dialerSeconds,
        avgConversationSeconds: r.avgConversationSeconds,
        buyRatePct: r.buyRatePct,
        campaigns: r.campaigns,
      };
    });

    const dayLabel = new Intl.DateTimeFormat("da-DK", {
      timeZone: "Europe/Copenhagen",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(board.start);

    return NextResponse.json({
      dayKey,
      todayKey,
      dayLabel,
      isAdmin,
      start: board.start.toISOString(),
      rows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[leaderboard]", e);
    return NextResponse.json(
      { error: "Kunne ikke hente scoreboard", details: process.env.NODE_ENV === "development" ? msg : undefined },
      { status: 500 },
    );
  }
}
