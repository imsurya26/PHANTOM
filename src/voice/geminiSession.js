import { geminiSetup } from './geminiProtocol.js';
import { createGeminiAudio } from './geminiAudio.js';

const ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
export function createGeminiSession({
  run,
  onState = () => {},
  fetchImpl = fetch,
  WebSocketClass = WebSocket,
  audioFactory = createGeminiAudio,
  signal,
}) {
  let active = null;
  function stop(state = 'Ready') {
    const owner = active;
    active = null;
    if (owner) {
      owner.controller.abort();
      clearTimeout(owner.deadline);
      clearTimeout(owner.expiry);
      clearTimeout(owner.navigation);
      owner.audio?.close();
      if (owner.socket) {
        owner.socket.onopen =
          owner.socket.onmessage =
          owner.socket.onerror =
          owner.socket.onclose =
            null;
        owner.socket.close();
      }
    }
    onState(state);
  }
  async function start() {
    if (active || signal?.aborted) return;
    const owner = {
      controller: new AbortController(),
      calls: new Set(),
      toolCount: 0,
      pendingTools: 0,
    };
    active = owner;
    const current = () => active === owner && !owner.controller.signal.aborted;
    const fail = () => {
      if (current()) stop('Connection issue');
    };
    const send = (value) => {
      if (!current() || owner.socket?.readyState !== 1) return;
      if (owner.socket.bufferedAmount > 256_000) {
        fail();
        return;
      }
      owner.socket.send(JSON.stringify(value));
    };
    onState('Thinking');
    owner.deadline = setTimeout(fail, 30_000);
    try {
      owner.audio = await audioFactory({
        signal: owner.controller.signal,
        onAudio: (data, rate) => {
          if (owner.ready)
            send({
              realtimeInput: {
                audio: { data, mimeType: `audio/pcm;rate=${rate}` },
              },
            });
        },
        onPlaybackEnd: () => {
          if (current()) onState('Listening');
        },
      });
      if (!current()) {
        owner.audio.close();
        return;
      }
      const response = await fetchImpl('/api/gemini/token', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: owner.controller.signal,
      });
      if (!current()) return;
      if (!response.ok) {
        stop('Unavailable');
        return;
      }
      const data = await response.json();
      if (!current()) return;
      if (
        !/^auth_tokens\/[A-Za-z0-9._~-]{1,8000}$/.test(data.token) ||
        !/^gemini-[a-z0-9.-]{1,80}$/.test(data.model)
      )
        throw new Error('Invalid session');
      const remaining = Date.parse(data.expireTime) - Date.now();
      if (!(remaining > 0 && remaining <= 310_000))
        throw new Error('Expired session');
      owner.expiry = setTimeout(
        () => {
          if (current()) stop();
        },
        Math.min(remaining, 300_000),
      );
      const socket = (owner.socket = new WebSocketClass(
        `${ENDPOINT}?access_token=${encodeURIComponent(data.token)}`,
      ));
      socket.onopen = () => send({ setup: geminiSetup(data.model) });
      socket.onerror = socket.onclose = fail;
      socket.onmessage = async (event) => {
        try {
          // Bound each frame before decoding. Blob frames are supported too.
          if ((event.data?.size ?? event.data?.length ?? Infinity) > 512_000)
            throw new Error('Oversize frame');
          const message = JSON.parse(
            typeof event.data === 'string'
              ? event.data
              : await event.data.text(),
          );
          if (!current()) return;
          if (message.error || message.goAway) {
            fail();
            return;
          }
          // Cancel the whole bounded voice turn rather than allow late camera
          // mutations after the server withdraws a function call.
          if (message.toolCallCancellation) {
            stop();
            return;
          }
          if (message.setupComplete) {
            owner.ready = true;
            clearTimeout(owner.deadline);
            onState('Listening');
          }
          const content = message.serverContent;
          if (content?.interrupted) owner.audio.clear();
          if (content?.inputTranscription) onState('Thinking');
          for (const part of content?.modelTurn?.parts || [])
            if (part.inlineData) {
              owner.audio.play(part.inlineData.data, part.inlineData.mimeType);
              onState('Speaking');
            }
          if (content?.turnComplete && !owner.audio.playing)
            onState('Listening');
          const calls = message.toolCall?.functionCalls;
          if (calls) {
            if (!owner.ready) throw new Error('Session not ready');
            if (
              !Array.isArray(calls) ||
              calls.length > 8 ||
              owner.pendingTools + calls.length > 8 ||
              owner.toolCount + calls.length > 60
            )
              throw new Error('Tool budget');
            owner.pendingTools += calls.length;
            owner.toolCount += calls.length;
            const afterResponses = [];
            for (const call of calls) {
              if (!current()) return;
              if (
                typeof call.id !== 'string' ||
                call.id.length > 128 ||
                owner.calls.has(call.id)
              )
                throw new Error('Invalid call');
              owner.calls.add(call.id);
              onState('Thinking');
              const result = await run(call.name, call.args || {}, {
                signal: owner.controller.signal,
                isCurrent: current,
              });
              const { afterResponse, ...response } = result;
              send({
                toolResponse: {
                  functionResponses: [
                    { id: call.id, name: call.name, response },
                  ],
                },
              });
              owner.pendingTools--;
              if (current() && typeof afterResponse === 'function')
                afterResponses.push(afterResponse);
            }
            // Navigation closes the voice drawer. Dispatch all responses first,
            // then navigate on a new task; cancellation suppresses navigation.
            if (afterResponses.length)
              owner.navigation = setTimeout(() => {
                if (current()) afterResponses[0]();
              }, 0);
          }
        } catch {
          fail();
        }
      };
    } catch {
      fail();
    }
  }
  signal?.addEventListener('abort', () => stop(), { once: true });
  return {
    start,
    stop,
    get active() {
      return Boolean(active);
    },
  };
}
