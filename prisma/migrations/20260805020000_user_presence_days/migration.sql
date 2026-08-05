-- CreateTable
CREATE TABLE "UserPresenceDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "loginSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPresenceDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCampaignPresenceDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "dialerSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCampaignPresenceDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPresenceDay_userId_dayKey_key" ON "UserPresenceDay"("userId", "dayKey");

-- CreateIndex
CREATE INDEX "UserPresenceDay_dayKey_idx" ON "UserPresenceDay"("dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "UserCampaignPresenceDay_userId_campaignId_dayKey_key" ON "UserCampaignPresenceDay"("userId", "campaignId", "dayKey");

-- CreateIndex
CREATE INDEX "UserCampaignPresenceDay_dayKey_idx" ON "UserCampaignPresenceDay"("dayKey");

-- AddForeignKey
ALTER TABLE "UserPresenceDay" ADD CONSTRAINT "UserPresenceDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCampaignPresenceDay" ADD CONSTRAINT "UserCampaignPresenceDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCampaignPresenceDay" ADD CONSTRAINT "UserCampaignPresenceDay_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
