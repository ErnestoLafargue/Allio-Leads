-- Bookingsystem: fast lead-felt under Virksomhedsnavn.
ALTER TABLE "Lead" ADD COLUMN "bookingSystem" TEXT NOT NULL DEFAULT '';

-- Backfill: leads i bookingsystem-kampagner får kampagnenavnet (samme regex som lib/booking-system.ts).
UPDATE "Lead" l
SET "bookingSystem" = btrim(c."name")
FROM "Campaign" c
WHERE l."campaignId" = c."id"
  AND c."isSystemCampaign" = false
  AND c."name" ~* '(cbit|easy\s*practice|terapeut\s*booking|gecko|onlinebo(oq|ok)|planway|timma)';

-- Leads der er flyttet til systemkampagner (Kommende møder, Genbook …): brug seneste besøgte
-- bookingsystem-kampagne fra kø-historikken.
UPDATE "Lead" l
SET "bookingSystem" = src."name"
FROM (
  SELECT DISTINCT ON (v."leadId") v."leadId", btrim(c."name") AS "name"
  FROM "LeadVisitHistory" v
  JOIN "Campaign" c ON c."id" = v."campaignId"
  WHERE c."isSystemCampaign" = false
    AND c."name" ~* '(cbit|easy\s*practice|terapeut\s*booking|gecko|onlinebo(oq|ok)|planway|timma)'
  ORDER BY v."leadId", v."visitedAt" DESC
) src, "Campaign" cur
WHERE l."id" = src."leadId"
  AND cur."id" = l."campaignId"
  AND cur."isSystemCampaign" = true
  AND l."bookingSystem" = '';
