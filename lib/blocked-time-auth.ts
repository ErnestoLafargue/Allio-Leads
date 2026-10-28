type SessionLike = { user: { id: string; role: string } };

/**
 * Alle indloggede må blokere tid for en mødeansvarlig (fx sælgere på Victors kalender).
 * Selve målbrugeren valideres mod listen over mødeansvarlige i API-ruterne.
 * Eksisterende blokeringer må kun ændres/slettes af admin, ejeren eller den, der oprettede dem.
 */
export function canEditBlockedTime(
  session: SessionLike,
  row: { userId: string; createdByUserId: string },
): boolean {
  if (session.user.role === "ADMIN") return true;
  return session.user.id === row.userId || session.user.id === row.createdByUserId;
}

export const canDeleteBlockedTime = canEditBlockedTime;
