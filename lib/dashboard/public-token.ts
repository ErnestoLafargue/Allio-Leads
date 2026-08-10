import { randomBytes } from "crypto";

/** Generér uforudsigelig offentlig dashboard-token (URL-sikker, ~22 tegn). */
export function generateDashboardPublicToken(): string {
  return randomBytes(16).toString("base64url");
}

export function isValidDashboardPublicToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(token);
}
