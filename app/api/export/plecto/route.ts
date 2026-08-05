import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { copenhagenDayKey } from "@/lib/copenhagen-day";
import { computeScoreboardForDay } from "@/lib/scoreboard-day";

/**
 * GET /api/export/plecto?dayKey=YYYY-MM-DD
 *
 * Dagens scoreboard-tal som fladt JSON til Plecto (eller andet BI-værktøj).
 * Én række pr. bruger (totaler, campaignId=null) plus én pr. bruger+kampagne.
 * `externalId` er stabil pr. dag/bruger/kampagne, så Plecto-registreringer kan
 * opdateres idempotent ved gentagne kald samme dag.
 *
 * Adgang: enten header `Authorization: Bearer <PLECTO_EXPORT_TOKEN>` (til
 * Plectos pull), query `?token=<PLECTO_EXPORT_TOKEN>`, eller admin-session.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const configuredToken = process.env.PLECTO_EXPORT_TOKEN?.trim() || null;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || null;
  const queryToken = url.searchParams.get("token")?.trim() || null;
  const tokenOk =
    configuredToken !== null && (bearer === configuredToken || queryToken === configuredToken);

  let sessionOk = false;
  if (!tokenOk) {
    const session = await auth();
    sessionOk = session?.user?.role === "ADMIN";
  }
  if (!tokenOk && !sessionOk) {
    return NextResponse.json({ error: "Ugyldig adgang" }, { status: 401 });
  }

  try {
    const requestedDayKey = url.searchParams.get("dayKey")?.trim() ?? "";
    const dayKey =
      /^\d{4}-\d{2}-\d{2}$/.test(requestedDayKey) ? requestedDayKey : copenhagenDayKey();

    const board = await computeScoreboardForDay(dayKey);

    const rows = board.rows.flatMap((r) => {
      const userRow = {
        externalId: `${dayKey}:${r.userId}`,
        type: "user_day" as const,
        dayKey,
        userId: r.userId,
        userName: r.name,
        username: r.username,
        role: r.role,
        campaignId: null as string | null,
        campaignName: null as string | null,
        meetings: r.meetings,
        conversations: r.conversations,
        contacts: r.contacts,
        talkSeconds: r.talkSeconds,
        loginSeconds: r.loginSeconds,
        dialerSeconds: r.dialerSeconds,
        avgConversationSeconds: r.avgConversationSeconds,
        buyRatePct: r.buyRatePct,
      };
      const campaignRows = r.campaigns.map((c) => ({
        externalId: `${dayKey}:${r.userId}:${c.campaignId ?? "none"}`,
        type: "user_campaign_day" as const,
        dayKey,
        userId: r.userId,
        userName: r.name,
        username: r.username,
        role: r.role,
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        meetings: c.meetings,
        conversations: c.conversations,
        contacts: c.contacts,
        talkSeconds: c.talkSeconds,
        loginSeconds: 0,
        dialerSeconds: c.dialerSeconds,
        avgConversationSeconds: c.avgConversationSeconds,
        buyRatePct: c.buyRatePct,
      }));
      return [userRow, ...campaignRows];
    });

    return NextResponse.json({
      dayKey,
      generatedAt: new Date().toISOString(),
      rows,
    });
  } catch (e) {
    console.error("[export/plecto]", e);
    return NextResponse.json({ error: "Kunne ikke generere eksport" }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;
