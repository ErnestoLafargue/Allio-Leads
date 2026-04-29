import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getDailyTicketQueue } from "@/lib/tickets";

export async function GET(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId")?.trim() || session!.user.id;
  const selectedDate = searchParams.get("date")?.trim();
  if (!selectedDate) {
    return NextResponse.json({ error: "Mangler query-param: date=YYYY-MM-DD" }, { status: 400 });
  }

  try {
    const queue = await getDailyTicketQueue(userId, selectedDate);
    return NextResponse.json({ queue });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kunne ikke hente dagskø.";
    const status = message.includes("YYYY-MM-DD") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
