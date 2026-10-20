/** Fælles WebRTC-hjælpere til browser-Medlyt. */

export const MEDLYT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function createMedlytPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: MEDLYT_ICE_SERVERS });
}
