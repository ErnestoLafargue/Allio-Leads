-- Browser Medlyt signaling (admin ↔ sælger WebRTC)
CREATE TABLE IF NOT EXISTS "MedlytListenSession" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "offerSdp" TEXT,
    "answerSdp" TEXT,
    "adminIceJson" TEXT,
    "sellerIceJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedlytListenSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MedlytListenSession_targetUserId_status_idx" ON "MedlytListenSession"("targetUserId", "status");
CREATE INDEX IF NOT EXISTS "MedlytListenSession_adminUserId_status_idx" ON "MedlytListenSession"("adminUserId", "status");
