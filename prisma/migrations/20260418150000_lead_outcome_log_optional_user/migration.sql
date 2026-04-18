-- System-scoreboard: auto «Ny» efter voicemail/ikke hjemme/callback-frigivelse logges uden bruger.
ALTER TABLE "LeadOutcomeLog" DROP CONSTRAINT IF EXISTS "LeadOutcomeLog_userId_fkey";
ALTER TABLE "LeadOutcomeLog" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "LeadOutcomeLog" ADD CONSTRAINT "LeadOutcomeLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
