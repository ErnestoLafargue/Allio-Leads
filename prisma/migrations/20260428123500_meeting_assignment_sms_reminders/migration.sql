-- User profile phone for meeting assignment + SMS reminders.
ALTER TABLE "User"
ADD COLUMN "phone" TEXT;

-- Fast standard: Victor skal altid være default mødeansvarlig.
UPDATE "User"
SET "phone" = '+4560177438'
WHERE lower("username") = 'victor@allio.dk';

-- Meeting assignee on lead.
ALTER TABLE "Lead"
ADD COLUMN "assignedUserId" TEXT;

ALTER TABLE "Lead"
ADD CONSTRAINT "Lead_assignedUserId_fkey"
FOREIGN KEY ("assignedUserId")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "Lead_assignedUserId_meetingScheduledFor_idx"
ON "Lead"("assignedUserId", "meetingScheduledFor");

-- Backfill eksisterende bookede møder uden tildeling til Victor.
UPDATE "Lead"
SET "assignedUserId" = (
  SELECT u."id"
  FROM "User" u
  WHERE lower(u."username") = 'victor@allio.dk'
  LIMIT 1
)
WHERE "status" = 'MEETING_BOOKED'
  AND "assignedUserId" IS NULL;

-- Idempotent reminder dispatch log (one per user/day).
CREATE TABLE "MeetingReminderDispatch" (
  "id" TEXT NOT NULL,
  "reminderDayKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "meetingCount" INTEGER NOT NULL,
  "phone" TEXT NOT NULL,
  "smsText" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MeetingReminderDispatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingReminderDispatch_reminderDayKey_userId_key"
ON "MeetingReminderDispatch"("reminderDayKey", "userId");

CREATE INDEX "MeetingReminderDispatch_sentAt_idx"
ON "MeetingReminderDispatch"("sentAt");

ALTER TABLE "MeetingReminderDispatch"
ADD CONSTRAINT "MeetingReminderDispatch_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
