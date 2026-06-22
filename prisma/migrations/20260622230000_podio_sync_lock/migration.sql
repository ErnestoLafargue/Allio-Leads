-- Per-lead lås mod parallel Podio-sync (dubletter ved dobbelt bekræft).
ALTER TABLE "Lead" ADD COLUMN "podioSyncLockUntil" TIMESTAMP(3);
