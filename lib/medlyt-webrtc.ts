/** Fælles WebRTC-hjælpere til browser-Medlyt. */

export const MEDLYT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** Chrome kræver CRLF efter hver SDP-linje — også den sidste. */
export function normalizeMedlytSdp(sdp: string): string {
  const lines = sdp
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  return `${lines.join("\r\n")}\r\n`;
}

export function createMedlytPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: MEDLYT_ICE_SERVERS });
}
