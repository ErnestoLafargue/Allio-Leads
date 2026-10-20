/**
 * Bland sælger-mic + Telnyx remote (kunde) til ét MediaStream-spor til Medlyt-publish.
 * Når remote mangler, sendes kun mic — admin hører stadig sælgeren.
 */

export type MedlytMixHandle = {
  stream: MediaStream;
  update: (mic: MediaStream | null, remote: MediaStream | null) => void;
  destroy: () => void;
};

function liveAudioTracks(stream: MediaStream | null): MediaStreamTrack[] {
  if (!stream) return [];
  return stream.getAudioTracks().filter((t) => t.readyState === "live");
}

function cloneLive(stream: MediaStream | null): MediaStream | null {
  const tracks = liveAudioTracks(stream).map((t) => t.clone());
  if (!tracks.length) return null;
  return new MediaStream(tracks);
}

export function createMedlytMix(): MedlytMixHandle {
  const AC =
    typeof window !== "undefined"
      ? (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  if (!AC) {
    throw new Error("AudioContext mangler");
  }
  const ctx = new AC();
  const dest = ctx.createMediaStreamDestination();
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  oscGain.gain.value = 0;
  osc.connect(oscGain);
  oscGain.connect(dest);
  try {
    osc.start();
  } catch {
    /* already started */
  }

  let micSource: MediaStreamAudioSourceNode | null = null;
  let remoteSource: MediaStreamAudioSourceNode | null = null;
  let micGain: GainNode | null = null;
  let remoteGain: GainNode | null = null;
  let micClone: MediaStream | null = null;
  let remoteClone: MediaStream | null = null;

  const disconnect = (node: AudioNode | null) => {
    try {
      node?.disconnect();
    } catch {
      /* no-op */
    }
  };

  const stopClone = (stream: MediaStream | null) => {
    if (!stream) return;
    for (const t of stream.getTracks()) {
      try {
        t.stop();
      } catch {
        /* no-op */
      }
    }
  };

  const update = (mic: MediaStream | null, remote: MediaStream | null) => {
    disconnect(micSource);
    disconnect(remoteSource);
    disconnect(micGain);
    disconnect(remoteGain);
    stopClone(micClone);
    stopClone(remoteClone);
    micSource = null;
    remoteSource = null;
    micGain = null;
    remoteGain = null;
    micClone = null;
    remoteClone = null;

    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => undefined);
    }

    micClone = cloneLive(mic);
    if (micClone) {
      try {
        micSource = ctx.createMediaStreamSource(micClone);
        micGain = ctx.createGain();
        micGain.gain.value = 1;
        micSource.connect(micGain);
        micGain.connect(dest);
      } catch {
        stopClone(micClone);
        micClone = null;
        micSource = null;
        micGain = null;
      }
    }

    remoteClone = cloneLive(remote);
    if (remoteClone) {
      try {
        remoteSource = ctx.createMediaStreamSource(remoteClone);
        remoteGain = ctx.createGain();
        remoteGain.gain.value = 1;
        remoteSource.connect(remoteGain);
        remoteGain.connect(dest);
      } catch {
        stopClone(remoteClone);
        remoteClone = null;
        remoteSource = null;
        remoteGain = null;
      }
    }
  };

  const destroy = () => {
    disconnect(micSource);
    disconnect(remoteSource);
    disconnect(micGain);
    disconnect(remoteGain);
    disconnect(osc);
    disconnect(oscGain);
    stopClone(micClone);
    stopClone(remoteClone);
    try {
      osc.stop();
    } catch {
      /* no-op */
    }
    try {
      void ctx.close();
    } catch {
      /* no-op */
    }
  };

  return { stream: dest.stream, update, destroy };
}

/** Direkte mic-stream hvis Web Audio-mix fejler. */
export function fallbackPublishStream(mic: MediaStream | null): MediaStream | null {
  return cloneLive(mic);
}
