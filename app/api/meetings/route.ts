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

  const from = new Date(searchParams.get("from") ?? "");
  const to = new Date(searchParams.get("to") ?? "");
  const range =
    !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from < to ? { from, to } : undefined;

  const meetings = await getMeetings(type, { activeOnly, range });

  return NextResponse.json(meetings);
}
