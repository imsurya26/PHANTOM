export function pcmBase64(samples) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, index) =>
    view.setInt16(
      index * 2,
      Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767),
      true,
    ),
  );
  return btoa(String.fromCharCode(...bytes));
}
export async function createGeminiAudio({
  signal,
  onAudio,
  onPlaybackEnd,
  mediaDevices = navigator.mediaDevices,
  AudioContextClass = globalThis.AudioContext,
}) {
  let stream, context, source, node, mute;
  let closed = false,
    nextAt = 0;
  const playing = new Set();
  function clear() {
    for (const item of playing) {
      item.onended = null;
      try {
        item.stop();
      } catch {}
      item.disconnect();
    }
    playing.clear();
    nextAt = 0;
  }
  function close() {
    if (closed) return;
    closed = true;
    clear();
    stream?.getTracks().forEach((track) => track.stop());
    source?.disconnect();
    if (node) {
      node.port.onmessage = null;
      node.port.close();
      node.disconnect();
    }
    mute?.disconnect();
    if (context) void context.close().catch(() => {});
    signal?.removeEventListener('abort', close);
  }
  signal?.addEventListener('abort', close, { once: true });
  try {
    if (signal?.aborted) throw new Error('closed');
    // Create/resume during the start gesture, before asynchronous provisioning.
    context = new AudioContextClass();
    await context.resume();
    if (closed || signal?.aborted) throw new Error('closed');
    stream = await mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
    if (closed || signal?.aborted) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('closed');
    }
    await context.audioWorklet.addModule(
      new URL('./geminiAudioWorklet.js', import.meta.url),
    );
    if (closed) throw new Error('closed');
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, 'phantom-microphone');
    mute = context.createGain();
    mute.gain.value = 0;
    source.connect(node).connect(mute).connect(context.destination);
    node.port.onmessage = ({ data }) => {
      if (!closed) onAudio(pcmBase64(data), context.sampleRate);
    };
    return {
      close,
      clear,
      play(data, mimeType) {
        if (
          closed ||
          mimeType !== 'audio/pcm;rate=24000' ||
          typeof data !== 'string' ||
          data.length > 256_000
        )
          return;
        if (nextAt - context.currentTime > 15 || playing.size > 128)
          throw new Error('Audio backlog');
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        if (!bytes.length || bytes.length % 2) throw new Error('Invalid audio');
        const view = new DataView(bytes.buffer);
        const buffer = context.createBuffer(1, bytes.length / 2, 24000);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < channel.length; i++)
          channel[i] = view.getInt16(i * 2, true) / 32768;
        const output = context.createBufferSource();
        output.buffer = buffer;
        output.connect(context.destination);
        output.onended = () => {
          playing.delete(output);
          output.disconnect();
          if (!playing.size) onPlaybackEnd?.();
        };
        playing.add(output);
        nextAt = Math.max(nextAt, context.currentTime);
        output.start(nextAt);
        nextAt += buffer.duration;
      },
      get playing() {
        return playing.size > 0;
      },
    };
  } catch (error) {
    close();
    throw error;
  }
}
