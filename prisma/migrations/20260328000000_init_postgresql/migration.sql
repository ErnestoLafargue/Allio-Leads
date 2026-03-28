-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SELLER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLoginDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "loggedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLoginDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fieldConfig" TEXT NOT NULL DEFAULT '{}',
    "includeProtectedBusinesses" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "cvr" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "industry" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "customFields" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "voicemailMarkedAt" TIMESTAMP(3),
    "notHomeMarkedAt" TIMESTAMP(3),
    "meetingBookedAt" TIMESTAMP(3),
    "meetingScheduledFor" TIMESTAMP(3),
    "bookedByUserId" TEXT,
    "meetingContactName" TEXT NOT NULL DEFAULT '',
    "meetingContactEmail" TEXT NOT NULL DEFAULT '',
    "meetingContactPhonePrivate" TEXT NOT NULL DEFAULT '',
    "meetingOutcomeStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "meetingCommissionDayKey" TEXT NOT NULL DEFAULT '',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedByUserId" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadOutcomeLog" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadOutcomeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "UserLoginDay_dayKey_idx" ON "UserLoginDay"("dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "UserLoginDay_userId_dayKey_key" ON "UserLoginDay"("userId", "dayKey");

-- CreateIndex
CREATE INDEX "Lead_lockExpiresAt_idx" ON "Lead"("lockExpiresAt");

-- CreateIndex
CREATE INDEX "Lead_lockedByUserId_idx" ON "Lead"("lockedByUserId");

-- CreateIndex
CREATE INDEX "LeadOutcomeLog_userId_createdAt_idx" ON "LeadOutcomeLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadOutcomeLog_createdAt_idx" ON "LeadOutcomeLog"("createdAt");

-- AddForeignKey
ALTER TABLE "UserLoginDay" ADD CONSTRAINT "UserLoginDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_bookedByUserId_fkey" FOREIGN KEY ("bookedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_lockedByUserId_fkey" FOREIGN KEY ("lockedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOutcomeLog" ADD CONSTRAINT "LeadOutcomeLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOutcomeLog" ADD CONSTRAINT "LeadOutcomeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
