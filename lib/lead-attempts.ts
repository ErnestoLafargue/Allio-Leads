import type { Prisma } from "@prisma/client";
import {
  normalizeLeaderboardOutcomeStatus,
  shouldLogOutcomeForLeaderboard,
} from "@/lib/lead-outcome-log";

/** Vis advarsel i leads-oversigten når leadet har flere ubesvarede forsøg end dette. */
export const MAX_ATTEMPTS_WARNING = 10;

const UNANSWERED_OUTCOME_STATUSES = new Set(["VOICEMAIL", "NOT_HOME"]);

export function isUnansweredOutcomeStatus(status: string): boolean {
  return UNANSWERED_OUTCOME_STATUSES.has(normalizeLeaderboardOutcomeStatus(status));
}

/**
 * Øg tælleren kun ved reelt nyt ubesvaret udfald (samme invariant som LeadOutcomeLog).
 */
export function shouldIncrementUnansweredAttempts(
  existing: { status: string; meetingBookedAt: Date | null },
  newStatus: string,
): boolean {
  if (!shouldLogOutcomeForLeaderboard(existing, newStatus)) return false;
  return isUnansweredOutcomeStatus(newStatus);
}

/** Prisma-where: leads der må ringes op ifølge kampagnens max-grænse. null/undefined = ingen grænse. */
export function unansweredAttemptsWithinMaxWhere(
  maxContactAttempts: number | null | undefined,
): Prisma.LeadWhereInput {
  if (maxContactAttempts === null || maxContactAttempts === undefined) return {};
  return { unansweredAttempts: { lte: maxContactAttempts } };
}

export function parseMaxContactAttemptsInput(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    if (!Number.isInteger(raw) || raw < 0) return null;
    return raw;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }
  return null;
}

export function leadExceedsMaxAttemptsWarning(unansweredAttempts: number): boolean {
  return unansweredAttempts > MAX_ATTEMPTS_WARNING;
}

/** Standard cooldown efter VOICEMAIL / TRÆFFES IKKE før lead auto-sættes til Ny igen. */
export const DEFAULT_UNANSWERED_COOLDOWN_HOURS = 2;
export const MIN_UNANSWERED_COOLDOWN_HOURS = 1;

export function normalizeUnansweredCooldownHours(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return DEFAULT_UNANSWERED_COOLDOWN_HOURS;
  const n = Math.floor(raw);
  if (n < MIN_UNANSWERED_COOLDOWN_HOURS) return MIN_UNANSWERED_COOLDOWN_HOURS;
  return n;
}

export function unansweredCooldownMs(hours: number | null | undefined): number {
  return normalizeUnansweredCooldownHours(hours) * 60 * 60 * 1000;
}

/** true når cooldown er udløbet ift. markeret tidspunkt. */
export function isUnansweredCooldownExpired(
  markedAt: Date,
  cooldownHours: number | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  return markedAt.getTime() <= nowMs - unansweredCooldownMs(cooldownHours);
}

export function parseUnansweredCooldownHoursInput(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    if (!Number.isInteger(raw) || raw < MIN_UNANSWERED_COOLDOWN_HOURS) return null;
    return raw;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < MIN_UNANSWERED_COOLDOWN_HOURS) return null;
    return n;
  }
  return null;
}
