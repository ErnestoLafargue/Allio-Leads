import type { Session } from "next-auth";

export function canManageBlockedTimeForUser(
  session: { user: { id: string; role: string } },
  targetUserId: string,
): boolean {
  if (session.user.role === "ADMIN") return true;
  return session.user.id === targetUserId;
}

export function canDeleteBlockedTime(
  session: { user: { id: string; role: string } },
  row: { userId: string; createdByUserId: string },
): boolean {
  if (session.user.role === "ADMIN") return true;
  return session.user.id === row.userId || session.user.id === row.createdByUserId;
}
