import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getMeetings, type MeetingsType } from "@/lib/meetings";

export async function GET(req: Request) {
  const { response } = await requireSession();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const rawType = searchParams.get("type")?.trim().toLowerCase() ?? "all";
  const type: MeetingsType = rawType === "upcoming" || rawType === "past" || rawType === "all" ? rawType : "all";
  const showAll = searchParams.get("showAll") === "true";

  const meetings = await getMeetings(type, { showAll });

  return NextResponse.json(meetings);
}
