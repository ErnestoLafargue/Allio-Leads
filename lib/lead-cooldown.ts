import { prisma } from "@/lib/prisma";

const VOICEMAIL_MS = 2 * 60 * 60 * 1000;
const NOT_HOME_MS = 6 * 60 * 60 * 1000;

/**
 * Sætter leads med udløbet ventetid tilbage til NEW (kaldes før læsning af leads).
 * Bruger rå SQL så opdateringen ikke afhænger af Prisma Clients filter-API for de nye felter
 * (undgår bl.a. «Unknown argument voicemailMarkedAt» ved gammel/cached client).
 *
 * Tilbagekald: rækker med planlagt genopkald må ikke auto-nulstilles til «Ny» af 2t/6t-reglen
 * (kun rækker uden callback-plan).
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
      AND "callbackScheduledFor" IS NULL
      AND (
        ("voicemailMarkedAt" IS NOT NULL AND "voicemailMarkedAt" <= ${voicemailCutoff})
        OR ("voicemailMarkedAt" IS NULL AND "updatedAt" <= ${voicemailCutoff})
      )
  `;

  /** Ikke hjemme: først tilbage som «Ny» i køen når der er gået 6 t fra markering (`notHomeMarkedAt`). Ingen fallback til `updatedAt` (undgår for tidlig genåbning). */
  await prisma.$executeRaw`
    UPDATE "Lead"
    SET
      "status" = 'NEW',
      "voicemailMarkedAt" = NULL,
      "notHomeMarkedAt" = NULL,
      "updatedAt" = ${touchedAt}
    WHERE "status" = 'NOT_HOME'
      AND "callbackScheduledFor" IS NULL
      AND "notHomeMarkedAt" IS NOT NULL
      AND "notHomeMarkedAt" <= ${notHomeCutoff}
  `;

  await releaseStaleCallbacksToCampaignPool(touchedAt);
}

/**
 * Planlagt tilbagekald er overskredet, tildelte har været inde på leadet, men udfald er ikke ændret
 * (stadig CALLBACK_SCHEDULED + PENDING) → lead tilbage som «Ny» i kampagnekøen for alle.
 */
export async function releaseStaleCallbacksToCampaignPool(now: Date = new Date()): Promise<void> {
  const touchedAt = new Date();
  await prisma.$executeRaw`
    UPDATE "Lead"
    SET
      "status" = 'NEW',
      "callbackScheduledFor" = NULL,
      "callbackReservedByUserId" = NULL,
      "callbackStatus" = 'PENDING',
      "callbackNote" = '',
      "callbackCreatedByUserId" = NULL,
      "callbackSeenByAssigneeAt" = NULL,
      "lockedByUserId" = NULL,
      "lockedAt" = NULL,
      "lockExpiresAt" = NULL,
      "updatedAt" = ${touchedAt}
    WHERE "status" = 'CALLBACK_SCHEDULED'
      AND "callbackStatus" = 'PENDING'
      AND "callbackScheduledFor" IS NOT NULL
      AND "callbackScheduledFor" <= ${now}
      AND "callbackSeenByAssigneeAt" IS NOT NULL
  `;
}

/** Første gang tildelte åbner/reserverer lead med aktivt tilbagekald (bevares til genudlevering ved udløb). */
export async function markCallbackSeenByAssignee(leadId: string, assigneeUserId: string): Promise<void> {
  const seenAt = new Date();
  await prisma.$executeRaw`
    UPDATE "Lead"
    SET "callbackSeenByAssigneeAt" = COALESCE("callbackSeenByAssigneeAt", ${seenAt})
    WHERE "id" = ${leadId}
      AND "status" = 'CALLBACK_SCHEDULED'
      AND "callbackStatus" = 'PENDING'
      AND "callbackReservedByUserId" = ${assigneeUserId}
  `;
}
