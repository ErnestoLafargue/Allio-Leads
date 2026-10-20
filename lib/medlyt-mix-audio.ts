/**
 * Bland sælger-mic + Telnyx remote (kunde) til ét MediaStream-spor til Medlyt-publish.
 * Når remote mangler, sendes kun mic — admin hører stadig sælgeren.
 */

export type MedlytMixHandle = {
  stream: MediaStream;
  update: (mic: MediaStream | null, remote: MediaStream | null) => void;
  destroy: () => void;
};

export function createMedlytMix(): MedlytMixHandle {
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  let micSource: MediaStreamAudioSourceNode | null = null;
  let remoteSource: MediaStreamAudioSourceNode | null = null;
  let micGain: GainNode | null = null;
  let remoteGain: GainNode | null = null;

  const disconnect = (node: AudioNode | null) => {
    try {
      node?.disconnect();
    } catch {
      /* no-op */
    }
  };

  const update = (mic: MediaStream | null, remote: MediaStream | null) => {
    disconnect(micSource);
    disconnect(remoteSource);
    disconnect(micGain);
    disconnect(remoteGain);
    micSource = null;
    remoteSource = null;
    micGain = null;
    remoteGain = null;

    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => undefined);
    }

    if (mic && mic.getAudioTracks().some((t) => t.readyState === "live")) {
      micSource = ctx.createMediaStreamSource(mic);
      micGain = ctx.createGain();
      micGain.gain.value = 1;
      micSource.connect(micGain);
      micGain.connect(dest);
    }

    if (remote && remote.getAudioTracks().some((t) => t.readyState === "live")) {
      remoteSource = ctx.createMediaStreamSource(remote);
      remoteGain = ctx.createGain();
      remoteGain.gain.value = 1;
      remoteSource.connect(remoteGain);
      remoteGain.connect(dest);
    }
  };

  const destroy = () => {
    disconnect(micSource);
    disconnect(remoteSource);
    disconnect(micGain);
    disconnect(remoteGain);
    try {
      void ctx.close();
    } catch {
      /* no-op */
    }
  };

  return { stream: dest.stream, update, destroy };
}
