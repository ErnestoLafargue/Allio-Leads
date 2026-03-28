import { prisma } from "@/lib/prisma";

const VOICEMAIL_MS = 2 * 60 * 60 * 1000;
const NOT_HOME_MS = 6 * 60 * 60 * 1000;

/**
 * Sætter leads med udløbet ventetid tilbage til NEW (kaldes før læsning af leads).
 * Bruger rå SQL så opdateringen ikke afhænger af Prisma Clients filter-API for de nye felter
 * (undgår bl.a. «Unknown argument voicemailMarkedAt» ved gammel/cached client).
 */
export async function applyLeadCooldownResets(): Promise<void> {
  const now = Date.now();
  const voicemailCutoff = new Date(now - VOICEMAIL_MS);
  const notHomeCutoff = new Date(now - NOT_HOME_MS);
  const touchedAt = new Date();

  await prisma.$executeRaw`
    UPDATE "Lead"
    SET
      "status" = 'NEW',
      "voicemailMarkedAt" = NULL,
      "notHomeMarkedAt" = NULL,
      "updatedAt" = ${touchedAt}
    WHERE "status" = 'VOICEMAIL'
      AND (
        ("voicemailMarkedAt" IS NOT NULL AND "voicemailMarkedAt" <= ${voicemailCutoff})
        OR ("voicemailMarkedAt" IS NULL AND "updatedAt" <= ${voicemailCutoff})
      )
  `;

  await prisma.$executeRaw`
    UPDATE "Lead"
    SET
      "status" = 'NEW',
      "voicemailMarkedAt" = NULL,
      "notHomeMarkedAt" = NULL,
      "updatedAt" = ${touchedAt}
    WHERE "status" = 'NOT_HOME'
      AND (
        ("notHomeMarkedAt" IS NOT NULL AND "notHomeMarkedAt" <= ${notHomeCutoff})
        OR ("notHomeMarkedAt" IS NULL AND "updatedAt" <= ${notHomeCutoff})
      )
  `;
}
