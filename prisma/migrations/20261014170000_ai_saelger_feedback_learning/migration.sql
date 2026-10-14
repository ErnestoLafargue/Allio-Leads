-- AlterTable
ALTER TABLE "AiSaelgerLesson" ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "context" TEXT,
ADD COLUMN     "routerLabel" TEXT,
ADD COLUMN     "approach" TEXT,
ADD COLUMN     "model" TEXT;

-- CreateIndex
CREATE INDEX "AiSaelgerLesson_routerLabel_createdAt_idx" ON "AiSaelgerLesson"("routerLabel", "createdAt");

-- CreateTable
CREATE TABLE "AiSaelgerPrinciples" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lessonCount" INTEGER NOT NULL DEFAULT 0,
    "rationale" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "AiSaelgerPrinciples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiSaelgerPrinciples_version_key" ON "AiSaelgerPrinciples"("version");

-- CreateIndex
CREATE INDEX "AiSaelgerPrinciples_status_version_idx" ON "AiSaelgerPrinciples"("status", "version");
