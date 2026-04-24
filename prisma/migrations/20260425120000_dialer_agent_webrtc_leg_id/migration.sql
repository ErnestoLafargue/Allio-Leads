-- AgentSession: valgfri call_control_id fra browserens aktive WebRTC-samtale
ALTER TABLE "AgentSession" ADD COLUMN "webRtcCallControlId" TEXT;
