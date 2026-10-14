-- CreateTable
CREATE TABLE "AiSaelgerLesson" (
    "id" TEXT NOT NULL,
    "situation" TEXT NOT NULL,
    "customerLine" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSaelgerLesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiSaelgerLesson_situation_createdAt_idx" ON "AiSaelgerLesson"("situation", "createdAt");
