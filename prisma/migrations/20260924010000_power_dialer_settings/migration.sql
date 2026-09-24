-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telnyxCredentialSipUsername" TEXT,
ADD COLUMN     "telnyxSipUriCallingEnabledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "powerAmdEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "powerAmdMachineCountsAttempt" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "powerAmdUncertainAction" TEXT NOT NULL DEFAULT 'CONNECT',
ADD COLUMN     "powerDialRatio" DOUBLE PRECISION NOT NULL DEFAULT 5,
ADD COLUMN     "powerMaxDropRatePct" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "powerMaxInFlight" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "powerPauseMode" TEXT NOT NULL DEFAULT 'DRAIN',
ADD COLUMN     "powerRingTimeoutSecs" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "powerWrapUpSeconds" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AgentSession" ADD COLUMN     "clientInstanceId" TEXT,
ADD COLUMN     "drainUntil" TIMESTAMP(3),
ADD COLUMN     "readySince" TIMESTAMP(3),
ADD COLUMN     "reservedAt" TIMESTAMP(3),
ADD COLUMN     "webrtcReady" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wrapUpUntil" TIMESTAMP(3),
ALTER COLUMN "lastHeartbeat" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "DialerCallLog" ADD COLUMN     "agentAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bridgeRequestedAt" TIMESTAMP(3),
ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DialerQueueItem" ADD COLUMN     "connectedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DialerCallLog_campaignId_direction_endedAt_idx" ON "DialerCallLog"("campaignId", "direction", "endedAt");

-- CreateIndex
CREATE INDEX "DialerCallLog_campaignId_resolvedAt_idx" ON "DialerCallLog"("campaignId", "resolvedAt");

-- CreateIndex
CREATE INDEX "DialerQueueItem_activeCallControlId_idx" ON "DialerQueueItem"("activeCallControlId");

