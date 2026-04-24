-- AlterTable: per-agent Telnyx Telephony Credential
ALTER TABLE "User" ADD COLUMN "telnyxCredentialId" TEXT;
ALTER TABLE "User" ADD COLUMN "telnyxSipUsername" TEXT;
CREATE UNIQUE INDEX "User_telnyxCredentialId_key" ON "User"("telnyxCredentialId");
CREATE UNIQUE INDEX "User_telnyxSipUsername_key" ON "User"("telnyxSipUsername");

-- CreateTable: AgentSession
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "currentLeadCallControlId" TEXT,
    "currentAgentCallControlId" TEXT,
    "currentLeadId" TEXT,
    "lastHeartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_userId_campaignId_key" ON "AgentSession"("userId", "campaignId");
CREATE INDEX "AgentSession_campaignId_status_lastHeartbeat_idx" ON "AgentSession"("campaignId", "status", "lastHeartbeat");
CREATE INDEX "AgentSession_userId_lastHeartbeat_idx" ON "AgentSession"("userId", "lastHeartbeat");

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: DialerCallLog
CREATE TABLE "DialerCallLog" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT,
    "agentUserId" TEXT,
    "callControlId" TEXT NOT NULL,
    "callSessionId" TEXT,
    "direction" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'initiated',
    "amdResult" TEXT,
    "bridgeTargetId" TEXT,
    "fromNumber" TEXT,
    "toNumber" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "bridgedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "hangupCause" TEXT,
    "hangupSource" TEXT,
    "recordingUrl" TEXT,
    "rawEventsJson" TEXT,

    CONSTRAINT "DialerCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DialerCallLog_callControlId_key" ON "DialerCallLog"("callControlId");
CREATE INDEX "DialerCallLog_campaignId_startedAt_idx" ON "DialerCallLog"("campaignId", "startedAt");
CREATE INDEX "DialerCallLog_leadId_idx" ON "DialerCallLog"("leadId");
CREATE INDEX "DialerCallLog_agentUserId_startedAt_idx" ON "DialerCallLog"("agentUserId", "startedAt");
CREATE INDEX "DialerCallLog_state_startedAt_idx" ON "DialerCallLog"("state", "startedAt");

-- AddForeignKey
ALTER TABLE "DialerCallLog" ADD CONSTRAINT "DialerCallLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DialerCallLog" ADD CONSTRAINT "DialerCallLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DialerCallLog" ADD CONSTRAINT "DialerCallLog_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: DialerQueueItem
CREATE TABLE "DialerQueueItem" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastResult" TEXT,
    "activeCallControlId" TEXT,

    CONSTRAINT "DialerQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DialerQueueItem_leadId_key" ON "DialerQueueItem"("leadId");
CREATE INDEX "DialerQueueItem_campaignId_reservedAt_idx" ON "DialerQueueItem"("campaignId", "reservedAt");
CREATE INDEX "DialerQueueItem_expiresAt_idx" ON "DialerQueueItem"("expiresAt");

-- AddForeignKey
ALTER TABLE "DialerQueueItem" ADD CONSTRAINT "DialerQueueItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DialerQueueItem" ADD CONSTRAINT "DialerQueueItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
