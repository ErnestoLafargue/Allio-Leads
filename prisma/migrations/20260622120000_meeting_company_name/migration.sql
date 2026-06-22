-- Virksomhedsnavn til mødet (separat fra lead.companyName fra import).
ALTER TABLE "Lead" ADD COLUMN "meetingCompanyName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "LeadMeetingRecord" ADD COLUMN "meetingCompanyName" TEXT NOT NULL DEFAULT '';
