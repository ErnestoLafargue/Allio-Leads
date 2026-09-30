-- CreateTable
CREATE TABLE "CallRecording" (
    "id" TEXT NOT NULL,
    "telnyxRecordingId" TEXT NOT NULL,
    "telnyxCallSessionId" TEXT,
    "telnyxCallLegId" TEXT,
    "telnyxCallControlId" TEXT,
    "telnyxConnectionId" TEXT,
    "initiatedBy" TEXT,
    "channels" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'unknown',
    "fromNumber" TEXT,
    "toNumber" TEXT,
    "customerNumber" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL,
    "agentUserId" TEXT,
    "agentMatch" TEXT NOT NULL DEFAULT 'NONE',
    "leadId" TEXT,
    "leadMatch" TEXT NOT NULL DEFAULT 'NONE',
    "campaignId" TEXT,
    "activityEventId" TEXT,
    "playbackUrl" TEXT,
    "outcomeStatus" TEXT,
    "outcomeAt" TIMESTAMP(3),
    "pipelineStatus" TEXT NOT NULL DEFAULT 'NEW',
    "pipelineError" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallRecording_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CallRecording_telnyxRecordingId_key" ON "CallRecording"("telnyxRecordingId");

-- CreateIndex
CREATE INDEX "CallRecording_startedAt_idx" ON "CallRecording"("startedAt");

-- CreateIndex
CREATE INDEX "CallRecording_agentUserId_startedAt_idx" ON "CallRecording"("agentUserId", "startedAt");

-- CreateIndex
CREATE INDEX "CallRecording_leadId_startedAt_idx" ON "CallRecording"("leadId", "startedAt");

-- CreateIndex
CREATE INDEX "CallRecording_campaignId_startedAt_idx" ON "CallRecording"("campaignId", "startedAt");

-- CreateIndex
CREATE INDEX "CallRecording_pipelineStatus_startedAt_idx" ON "CallRecording"("pipelineStatus", "startedAt");

-- CreateIndex
CREATE INDEX "CallRecording_telnyxCallSessionId_idx" ON "CallRecording"("telnyxCallSessionId");

-- AddForeignKey
ALTER TABLE "CallRecording" ADD CONSTRAINT "CallRecording_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRecording" ADD CONSTRAINT "CallRecording_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRecording" ADD CONSTRAINT "CallRecording_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
