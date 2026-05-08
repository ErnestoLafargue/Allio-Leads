-- Telnyx Call Control application id for agenten credential connection (WebRTC).
-- Caches GET /v2/telephony_credentials/{id} → connection_id for hurtigere/pålidelig bridge.
ALTER TABLE "User" ADD COLUMN "telnyxCredentialConnectionId" TEXT;
