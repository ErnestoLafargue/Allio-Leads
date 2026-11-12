import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  getDefaultMeetingAssigneeId,
  listBlockedTimeOwners,
  listMeetingAssignableUsers,
} from "@/lib/meeting-assignee";

export async function GET() {
  const { response } = await requireSession();
  if (response) return response;

  const users = await listMeetingAssignableUsers();
  const defaultUserId = await getDefaultMeetingAssigneeId();
  const blockOwners = await listBlockedTimeOwners();

  return NextResponse.json({ users, defaultUserId, blockOwners });
}

