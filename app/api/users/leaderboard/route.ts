import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import {
  copenhagenDayBoundsUtc,
  copenhagenDayBoundsUtcFromDayKey,
  copenhagenDayKey,
} from "@/lib/copenhagen-day";
import {
  leaderboardDeltasForOutcome,
  warnIfScoreboardUserTallyInconsistent,
} from "@/lib/lead-outcome-log";

type PresentUser = {
  userId: string;
  user: { id: string; name: string; username: string; role: string };
};

function serverLocalDayBounds(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

async function loadPresentUsers(dayKey: string): Promise<PresentUser[]> {
  try {
    const rows = await prisma.userLoginDay.findMany({
      where: { dayKey },
      include: {
        user: { select: { id: true, name: true, username: true, role: true } },
      },
    });
    return rows.map((p) => ({ userId: p.userId, user: p.user }));
  } catch (e) {
    console.warn("[leaderboard] UserLoginDay query failed (migration kørt?):", e);
  }

  const sellers = await prisma.user.findMany({
    where: { role: "SELLER" },
    select: { id: true, name: true, username: true, role: true },
    orderBy: { name: "asc" },
  });
  return sellers.map((u) => ({ userId: u.id, user: u }));
}

async function mergePresentWithOutcomeUsers(
  present: PresentUser[],
  outcomeUserIds: string[],
): Promise<PresentUser[]> {
  const map = new Map<string, PresentUser>();
  for (const p of present) {
    map.set(p.userId, p);
  }
  const missingIds = outcomeUserIds.filter((id) => !map.has(id));
  if (missingIds.length === 0) {
    return Array.from(map.values());
  }
  const users = await prisma.user.findMany({
    where: { id: { in: missingIds } },
    select: { id: true, name: true, username: true, role: true },
  });
  for (const u of users) {
    map.set(u.id, { userId: u.id, user: u });
  }
  return Array.from(map.values());
}

/**
 * Seneste LeadOutcomeLog pr. lead inden for [start, end) — én tællende udfaldsregistrering pr. lead pr. dag.
 * (PostgreSQL DISTINCT ON)
 */
async function latestOutcomeLogRowsPerLeadInRange(
  start: Date,
  end: Date,
): Promise<{ leadId: string; userId: string; status: string }[]> {
  try {
    const rows = await prisma.$queryRaw<{ leadId: string; userId: string; status: string }[]>`
      SELECT DISTINCT ON ("leadId") "leadId", "userId", "status"
      FROM "LeadOutcomeLog"
      WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
      ORDER BY "leadId", "createdAt" DESC
    `;
    return rows;
  } catch (e) {
    console.warn("[leaderboard] DISTINCT ON LeadOutcomeLog failed:", e);
    return [];
  }
}

export async function GET(req: Request) {
  const { response } = await requireSession();
  if (response) return response;

  try {
    const searchParams = new URL(req.url).searchParams;
    const requestedDayKey = searchParams.get("dayKey")?.trim() ?? "";
    const dayKey =
      /^\d{4}-\d{2}-\d{2}$/.test(requestedDayKey) ? requestedDayKey : copenhagenDayKey();

    let start: Date;
    let end: Date;
    try {
      const b = requestedDayKey
        ? copenhagenDayBoundsUtcFromDayKey(dayKey)
        : copenhagenDayBoundsUtc();
      start = b.start;
      end = b.end;
    } catch (e) {
      console.warn("[leaderboard] copenhagenDayBoundsUtc failed, using serverlokal dag:", e);
      const b = serverLocalDayBounds();
      start = b.start;
      end = b.end;
    }
    const todayKey = copenhagenDayKey();

    const latestRows = await latestOutcomeLogRowsPerLeadInRange(start, end);
    const scoringUserIds = [...new Set(latestRows.map((r) => r.userId))];

    let present = await loadPresentUsers(dayKey);
    present = await mergePresentWithOutcomeUsers(present, scoringUserIds);

    if (present.length === 0) {
      const sellers = await prisma.user.findMany({
        where: { role: "SELLER" },
        select: { id: true, name: true, username: true, role: true },
        orderBy: { name: "asc" },
      });
      present = sellers.map((u) => ({ userId: u.id, user: u }));
    }

    const tallies = new Map<string, { meetings: number; conversations: number; contacts: number }>();
    for (const p of present) {
      tallies.set(p.userId, { meetings: 0, conversations: 0, contacts: 0 });
    }

    for (const row of latestRows) {
      const t = tallies.get(row.userId);
      if (!t) continue;
      const d = leaderboardDeltasForOutcome(row.status);
      t.meetings += d.meetings;
      t.conversations += d.conversations;
      t.contacts += d.contacts;
    }

    const dayLabel = new Intl.DateTimeFormat("da-DK", {
      timeZone: "Europe/Copenhagen",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(start);

    const board = present
      .map((p) => {
        const t = tallies.get(p.userId)!;
        warnIfScoreboardUserTallyInconsistent(p.userId, t.meetings, t.conversations, t.contacts);
        return {
          userId: p.user.id,
          name: p.user.name,
          username: p.user.username,
          role: p.user.role,
          meetings: t.meetings,
          conversations: t.conversations,
          contacts: t.contacts,
        };
      })
      .sort((a, b) => {
        if (b.meetings !== a.meetings) return b.meetings - a.meetings;
        if (b.conversations !== a.conversations) return b.conversations - a.conversations;
        return b.contacts - a.contacts;
      });

    return NextResponse.json({
      dayKey,
      todayKey,
      dayLabel,
      start: start.toISOString(),
      rows: board,
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
