-- Afventende bookede møder skal ligge i systemkampagnen «Kommende møder» (upcoming_meetings).
UPDATE "Lead" AS l
SET "campaignId" = c.id
FROM "Campaign" AS c
WHERE c."systemCampaignType" = 'upcoming_meetings'
  AND l."status" = 'MEETING_BOOKED'
  AND UPPER(TRIM(COALESCE(l."meetingOutcomeStatus", 'PENDING'))) = 'PENDING';

-- Ensret visningsnavn for genbooking-kampagne.
UPDATE "Campaign"
SET "name" = 'Genbook møde'
WHERE "systemCampaignType" = 'rebooking';
