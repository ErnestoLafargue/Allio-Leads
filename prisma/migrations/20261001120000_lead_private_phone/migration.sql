-- Privat telefonnummer på lead (virksomhedsnummer forbliver `phone`).
ALTER TABLE "Lead" ADD COLUMN "privatePhone" TEXT NOT NULL DEFAULT '';
