-- CreateTable
CREATE TABLE "CallTranscript" (
    "id" TEXT NOT NULL,
    "callRecordingId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "language" TEXT,
    "languages" JSONB,
    "segments" JSONB NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "agentTalkSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "customerTalkSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billedAudioSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallAnalysis" (
    "id" TEXT NOT NULL,
    "callRecordingId" TEXT NOT NULL,
    "analysisVersion" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "scores" JSONB NOT NULL,
    "overallScore" INTEGER,
    "warnings" JSONB,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesScriptVersion" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "weekKey" TEXT,
    "content" JSONB NOT NULL,
    "evidence" JSONB,
    "basedOnCalls" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "generatedBy" TEXT,
    "promptVersion" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesScriptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CallTranscript_callRecordingId_key" ON "CallTranscript"("callRecordingId");

-- CreateIndex
CREATE INDEX "CallAnalysis_analysisVersion_source_idx" ON "CallAnalysis"("analysisVersion", "source");

-- CreateIndex
CREATE UNIQUE INDEX "CallAnalysis_callRecordingId_analysisVersion_source_key" ON "CallAnalysis"("callRecordingId", "analysisVersion", "source");

-- CreateIndex
CREATE INDEX "SalesScriptVersion_kind_isActive_idx" ON "SalesScriptVersion"("kind", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SalesScriptVersion_kind_version_key" ON "SalesScriptVersion"("kind", "version");

-- AddForeignKey
ALTER TABLE "CallTranscript" ADD CONSTRAINT "CallTranscript_callRecordingId_fkey" FOREIGN KEY ("callRecordingId") REFERENCES "CallRecording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAnalysis" ADD CONSTRAINT "CallAnalysis_callRecordingId_fkey" FOREIGN KEY ("callRecordingId") REFERENCES "CallRecording"("id") ON DELETE CASCADE ON UPDATE CASCADE;
