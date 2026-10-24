/** Load voice and its action engine only after an explicit voice/tool request. */
export function createLazyVoice(
  options,
  load = () => import('../voice/geminiLive.js'),
) {
  let commands,
    pending,
    disposed = false;
  async function open() {
    if (disposed || options.signal?.aborted)
      throw new DOMException('Voice closed', 'AbortError');
    if (commands) return commands;
    if (!pending)
      pending = load()
        .then((module) => {
          if (disposed || options.signal?.aborted)
            throw new DOMException('Voice closed', 'AbortError');
          commands = module.initGevVoiceCommands(options);
          return commands;
        })
        .finally(() => {
          pending = null;
        });
    return pending;
  }
  return {
    open,
    async runner(...args) {
      return (await open()).runner(...args);
    },
    async start(...args) {
      return (await open()).start(...args);
    },
    stop(options = {}) {
      if (options.removeUi) disposed = true;
      commands?.stop(options);
      if (
        options.removeUi &&
        commands &&
        globalThis.window?.__gevVoiceCommands === commands
      )
        delete globalThis.window.__gevVoiceCommands;
    },
    get session() {
      return commands?.session;
    },
    get loaded() {
      return Boolean(commands);
    },
  };
}
