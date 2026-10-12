-- CreateTable
CREATE TABLE "LiveCoachEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "category" TEXT,
    "signal" TEXT,
    "line" TEXT,
    "latencyMs" INTEGER,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "promptVersion" TEXT,
    "helpful" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveCoachEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveCoachEvent_createdAt_idx" ON "LiveCoachEvent"("createdAt");

-- CreateIndex
CREATE INDEX "LiveCoachEvent_userId_createdAt_idx" ON "LiveCoachEvent"("userId", "createdAt");
