import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getMeetings, type MeetingsType } from "@/lib/meetings";

export async function GET(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const rawType = searchParams.get("type")?.trim().toLowerCase() ?? "all";
  const type: MeetingsType = rawType === "upcoming" || rawType === "past" || rawType === "all" ? rawType : "all";
  const activeOnly = searchParams.get("activeOnly") === "true";

  const meetings = await getMeetings(type, { activeOnly });

  return NextResponse.json(meetings);
}
