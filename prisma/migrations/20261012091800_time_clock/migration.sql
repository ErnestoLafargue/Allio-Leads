-- CreateTable
CREATE TABLE "TimeClockEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "punchedInAt" TIMESTAMP(3) NOT NULL,
    "punchedOutAt" TIMESTAMP(3),
    "dayKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeClockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeClockEntry_userId_dayKey_idx" ON "TimeClockEntry"("userId", "dayKey");

-- CreateIndex
CREATE INDEX "TimeClockEntry_dayKey_idx" ON "TimeClockEntry"("dayKey");

-- CreateIndex
CREATE INDEX "TimeClockEntry_userId_punchedOutAt_idx" ON "TimeClockEntry"("userId", "punchedOutAt");

-- Kun én åben stempling pr. bruger
CREATE UNIQUE INDEX "TimeClockEntry_userId_open_key" ON "TimeClockEntry"("userId") WHERE "punchedOutAt" IS NULL;

-- AddForeignKey
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
