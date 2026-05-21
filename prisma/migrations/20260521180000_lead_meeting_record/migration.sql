-- CreateTable
CREATE TABLE "LeadMeetingRecord" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "bookedByUserId" TEXT NOT NULL,
    "meetingBookedAt" TIMESTAMP(3) NOT NULL,
    "meetingScheduledFor" TIMESTAMP(3) NOT NULL,
    "meetingOutcomeStatus" TEXT NOT NULL,
    "meetingCommissionDayKey" TEXT NOT NULL DEFAULT '',
    "bookedFromRebookingCampaign" BOOLEAN NOT NULL DEFAULT false,
    "meetingContactName" TEXT NOT NULL DEFAULT '',
    "meetingContactEmail" TEXT NOT NULL DEFAULT '',
    "meetingContactPhonePrivate" TEXT NOT NULL DEFAULT '',
    "archivedReason" TEXT NOT NULL DEFAULT 'rebooked',
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadMeetingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadMeetingRecord_bookedByUserId_meetingCommissionDayKey_idx" ON "LeadMeetingRecord"("bookedByUserId", "meetingCommissionDayKey");

-- CreateIndex
CREATE INDEX "LeadMeetingRecord_leadId_archivedAt_idx" ON "LeadMeetingRecord"("leadId", "archivedAt");

-- CreateIndex
CREATE INDEX "LeadMeetingRecord_bookedByUserId_meetingScheduledFor_idx" ON "LeadMeetingRecord"("bookedByUserId", "meetingScheduledFor");

-- AddForeignKey
ALTER TABLE "LeadMeetingRecord" ADD CONSTRAINT "LeadMeetingRecord_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMeetingRecord" ADD CONSTRAINT "LeadMeetingRecord_bookedByUserId_fkey" FOREIGN KEY ("bookedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
