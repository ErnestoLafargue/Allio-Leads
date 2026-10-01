-- Kampagne: hvilket telefonnummer der ringes først (privat er default).
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "dialPhonePriority" TEXT NOT NULL DEFAULT 'PRIVATE_FIRST';

-- Lead: midlertidig markering af fejlet nummer i Power Dialer-failover-cyklus.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "dialFailoverPendingE164" TEXT NOT NULL DEFAULT '';
