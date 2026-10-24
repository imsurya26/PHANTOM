import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiSession } from './geminiSession.js';
import {
  createGeminiActions,
  geminiSetup,
  validGeminiCall,
} from './geminiProtocol.js';
import { pcmBase64 } from './geminiAudio.js';

function fixture(overrides = {}) {
  const states = [],
    sockets = [],
    calls = [];
  let audioOptions,
    closes = 0,
    plays = 0,
    clears = 0;
  class Socket {
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      this.bufferedAmount = 0;
      this.sent = [];
      sockets.push(this);
    }
    send(value) {
      this.sent.push(JSON.parse(value));
    }
    close() {
      this.closed = true;
    }
    message(value) {
      return this.onmessage({ data: JSON.stringify(value) });
    }
  }
  const session = createGeminiSession({
    WebSocketClass: Socket,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          token: 'auth_tokens/test-session',
          model: 'gemini-3.8-live',
          expireTime: new Date(Date.now() + 300_000).toISOString(),
        }),
      ),
    audioFactory: async (options) => {
      audioOptions = options;
      return {
        close() {
          closes++;
        },
        play() {
          plays++;
        },
        clear() {
          clears++;
        },
      };
    },
    run: async (...args) => {
      calls.push(args);
      return { ok: true };
    },
    onState: (state) => states.push(state),
    ...overrides,
  });
  return {
    session,
    sockets,
    calls,
    states,
    get audio() {
      return audioOptions;
    },
    get closes() {
      return closes;
    },
    get plays() {
      return plays;
    },
    get clears() {
      return clears;
    },
  };
}

test('Gemini tool allowlist rejects unknown names, arbitrary arguments and malformed values', () => {
  for (const [name, args] of [
    ['fetch', { url: 'https://example.test' }],
    ['searchPlace', { query: 'Chennai', url: 'x' }],
    ['setLayer', { layer: 'flights', enabled: 'true' }],
    ['openNexus', { __proto__: null, script: 'x' }],
    ['searchPlace', { query: 'x'.repeat(161) }],
  ])
    assert.equal(validGeminiCall(name, args), false);
  assert.equal(
    validGeminiCall('setLayer', { layer: 'flights', enabled: true }),
    true,
  );
  assert.equal(validGeminiCall('openNexus', {}), true);
});

test('approved aircraft, Chennai and Nexus actions invoke only explicit runner paths', async () => {
  const calls = [];
  let nexus = 0;
  const run = createGeminiActions({
    runner: async (...args) => {
      calls.push(args);
      return { ok: true, privatePayload: 'never-returned' };
    },
    selected: () => null,
    openNexus: () => () => ++nexus,
  });
  assert.deepEqual(await run('searchPlace', { query: 'Chennai' }), {
    ok: true,
    message: 'Action applied.',
  });
  await run('setLayer', { layer: 'flights', enabled: true });
  const nexusResult = await run('openNexus');
  assert.equal(nexus, 0);
  nexusResult.afterResponse();
  assert.equal(calls[0][0], 'fly_to_location');
  assert.equal(calls[0][1].query, 'Chennai');
  assert.equal(calls[1][0], 'set_layer_visibility');
  assert.equal(nexus, 1);
  assert.equal((await run('shell', {})).ok, false);
  assert.equal((await run('trackEntity')).ok, false);
  assert.equal(calls.length, 2);
});

test('session handshake gates microphone, plays audio, invokes tools and cleans up', async () => {
  const f = fixture();
  try {
    await f.session.start();
    await f.session.start();
    assert.equal(f.sockets.length, 1);
    const socket = f.sockets[0];
    assert.match(socket.url, /BidiGenerateContentConstrained\?access_token=/);
    socket.onopen();
    assert.deepEqual(socket.sent[0].setup, geminiSetup());
    f.audio.onAudio('AA==', 48000);
    assert.equal(socket.sent.length, 1);
    await socket.message({ setupComplete: {} });
    f.audio.onAudio('AA==', 48000);
    assert.equal(
      socket.sent[1].realtimeInput.audio.mimeType,
      'audio/pcm;rate=48000',
    );
    await socket.message({
      serverContent: {
        modelTurn: {
          parts: [
            { inlineData: { data: 'AAA=', mimeType: 'audio/pcm;rate=24000' } },
          ],
        },
      },
    });
    assert.equal(f.plays, 1);
    await socket.message({ serverContent: { interrupted: true } });
    assert.equal(f.clears, 1);
    await socket.message({
      toolCall: { functionCalls: [{ id: 'one', name: 'openNexus', args: {} }] },
    });
    assert.equal(f.calls.length, 1);
    assert.equal(
      socket.sent.at(-1).toolResponse.functionResponses[0].id,
      'one',
    );
    f.session.stop();
    assert.equal(f.audio.signal.aborted, true);
    assert.equal(f.closes, 1);
    assert.equal(socket.closed, true);
    assert.equal(f.states.at(-1), 'Ready');
  } finally {
    f.session.stop();
  }
});

test('quota failure closes microphone without opening a socket', async () => {
  const f = fixture({
    fetchImpl: async () => new Response('', { status: 429 }),
  });
  await f.session.start();
  assert.equal(f.sockets.length, 0);
  assert.equal(f.closes, 1);
  assert.equal(f.session.active, false);
  assert.equal(f.states.at(-1), 'Unavailable');
});

test('stop during microphone permission cleans a late grant and never provisions', async () => {
  let grant,
    closed = 0,
    fetched = 0;
  const f = fixture({
    audioFactory: () =>
      new Promise((resolve) => {
        grant = resolve;
      }),
    fetchImpl: () => {
      fetched++;
    },
  });
  const starting = f.session.start();
  f.session.stop();
  grant({
    close() {
      closed++;
    },
  });
  await starting;
  assert.equal(closed, 1);
  assert.equal(fetched, 0);
});

test('server cancellation, oversized messages and backpressure end only voice', async () => {
  for (const mode of ['cancel', 'oversize', 'backpressure']) {
    const f = fixture();
    await f.session.start();
    const socket = f.sockets[0];
    if (mode === 'cancel')
      await socket.message({ toolCallCancellation: { ids: ['x'] } });
    if (mode === 'oversize')
      await socket.onmessage({ data: ' '.repeat(512001) });
    if (mode === 'backpressure') {
      socket.bufferedAmount = 256001;
      socket.onopen();
    }
    assert.equal(f.session.active, false);
    assert.equal(socket.closed, true);
    assert.equal(f.closes, 1);
  }
});

test('microphone encoding uses clamped little-endian PCM16', () => {
  assert.deepEqual(
    [...Buffer.from(pcmBase64(new Float32Array([-2, 0, 2])), 'base64')],
    [0, 128, 0, 0, 255, 127],
  );
});

test('late token failure cannot stop a newer session', async () => {
  let resolveFirst,
    requests = 0;
  const f = fixture({
    fetchImpl: () => {
      requests++;
      if (requests === 1)
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            token: 'auth_tokens/new-session',
            model: 'gemini-3.8-live',
            expireTime: new Date(Date.now() + 300000).toISOString(),
          }),
        ),
      );
    },
  });
  const first = f.session.start();
  await new Promise((resolve) => setImmediate(resolve));
  f.session.stop();
  await f.session.start();
  resolveFirst(new Response('', { status: 503 }));
  await first;
  assert.equal(f.session.active, true);
  assert.equal(f.sockets.length, 1);
  f.session.stop();
});

test('function calls before handshake and repeated call IDs are rejected', async () => {
  for (const duplicate of [false, true]) {
    const f = fixture();
    await f.session.start();
    const socket = f.sockets[0];
    if (duplicate) await socket.message({ setupComplete: {} });
    const call = {
      toolCall: {
        functionCalls: [{ id: 'same', name: 'openNexus', args: {} }],
      },
    };
    await socket.message(call);
    if (duplicate) await socket.message(call);
    assert.equal(f.session.active, false);
    assert.equal(f.calls.length, duplicate ? 1 : 0);
  }
});

test('Nexus navigation sends its response before drawer closure aborts voice', async () => {
  let navigated = false;
  const f = fixture({
    run: async () => ({
      ok: true,
      afterResponse: () => {
        assert.equal(
          f.sockets[0].sent.at(-1).toolResponse.functionResponses[0].response
            .ok,
          true,
        );
        navigated = true;
        f.session.stop();
      },
    }),
  });
  await f.session.start();
  const socket = f.sockets[0];
  await socket.message({ setupComplete: {} });
  await socket.message({
    toolCall: { functionCalls: [{ id: 'nexus', name: 'openNexus', args: {} }] },
  });
  assert.equal(navigated, false);
  assert.deepEqual(
    socket.sent.at(-1).toolResponse.functionResponses[0].response,
    { ok: true },
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(navigated, true);
  assert.equal(f.session.active, false);
  assert.equal(f.closes, 1);
});
