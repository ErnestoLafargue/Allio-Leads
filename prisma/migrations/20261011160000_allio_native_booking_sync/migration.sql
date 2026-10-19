-- AlterTable
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "meetingType" TEXT NOT NULL DEFAULT 'ONLINE';
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "meetingAddress" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "allioCustomerId" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "allioBookingId" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "allioNativeSyncLockUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Lead_allioBookingId_idx" ON "Lead"("allioBookingId");

-- CreateTable
CREATE TABLE IF NOT EXISTS "AllioNativeOccupancy" (
    "id" TEXT NOT NULL,
    "allioBookingId" TEXT NOT NULL,
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "source" TEXT NOT NULL DEFAULT 'booking',
    "title" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllioNativeOccupancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AllioNativeOccupancy_allioBookingId_key" ON "AllioNativeOccupancy"("allioBookingId");
CREATE INDEX IF NOT EXISTS "AllioNativeOccupancy_startDateTime_endDateTime_idx" ON "AllioNativeOccupancy"("startDateTime", "endDateTime");
CREATE INDEX IF NOT EXISTS "AllioNativeOccupancy_status_idx" ON "AllioNativeOccupancy"("status");

-- CreateTable
CREATE TABLE IF NOT EXISTS "AllioNativeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllioNativeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AllioNativeWebhookEvent_processedAt_idx" ON "AllioNativeWebhookEvent"("processedAt");
