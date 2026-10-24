import { createGevActionRunner } from './gevActions.js';
import { getSelectedEntityContext } from '../data/contextStore.js';
import { createGeminiActions } from './geminiProtocol.js';
import { createGeminiSession } from './geminiSession.js';

// Preserve the standalone facade's naming for manual actions and shell mounting.
export function initGevVoiceCommands(options) {
  const lifetime = new AbortController();
  const runner = createGevActionRunner(options);
  const controls = document.createElement('div');
  controls.id = 'gev-voice-control';
  controls.className = 'phantom-gemini-control';
  controls.hidden = true;
  const button = document.createElement('button');
  button.id = 'gev-voice-button';
  button.type = 'button';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const note = document.createElement('p');
  note.textContent =
    'Gemini Live uses your microphone only while connected. Sessions end after five minutes. Try “Show aircraft over Chennai” or “Open Nexus”.';
  controls.append(button, status, note);
  document.body.append(controls);
  const run = createGeminiActions({
    runner,
    selected: () => {
      const entity = getSelectedEntityContext({
        dataManager: options.dataManager,
      });
      return entity &&
        ['flights', 'military', 'ais-live-vessels'].includes(entity.layerId)
        ? { query: String(entity.id), layerId: entity.layerId }
        : null;
    },
    openNexus: () => {
      const control = document.querySelector(
        '.phantom-nav [data-section="Nexus"], .phantom-nav [data-section="Analysis"]',
      );
      if (!control) return null;
      return () => {
        control.click();
        const notice = document.createElement('p');
        notice.setAttribute('role', 'status');
        notice.textContent =
          'Voice ended when Nexus opened. Your microphone is off.';
        document.querySelector('.phantom-content')?.prepend(notice);
      };
    },
  });
  function state(value) {
    status.textContent = ['Unavailable', 'Connection issue'].includes(value)
      ? `${value}. Voice is temporarily unavailable. Map controls still work.`
      : value;
    button.textContent = ['Listening', 'Thinking', 'Speaking'].includes(value)
      ? 'Stop voice'
      : 'Start voice';
    button.setAttribute('aria-label', button.textContent);
  }
  const session = createGeminiSession({
    run,
    onState: state,
    signal: lifetime.signal,
  });
  state('Ready');
  button.addEventListener(
    'click',
    () => {
      if (session.active) stop();
      else void session.start();
    },
    { signal: lifetime.signal },
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) stop();
    },
    { signal: lifetime.signal },
  );
  window.addEventListener('pagehide', () => stop(), {
    signal: lifetime.signal,
  });
  function stop({ removeUi = false } = {}) {
    session.stop();
    runner.resetConversation?.();
    if (removeUi) {
      lifetime.abort();
      runner.dispose?.();
      controls.remove();
    }
  }
  options.signal?.addEventListener('abort', () => stop({ removeUi: true }), {
    once: true,
  });
  return { runner, session, start: () => session.start(), stop };
}
