import { layerActionMessage } from './layerAction.js';

/** Coalesce clicks and limit manual refresh fan-out without toggling layers. */
export function createDataReloader(
  manager,
  { now = Date.now, cooldownMs = 15000 } = {},
) {
  const pending = new Map();
  const finished = new Map();
  async function reload(id, { signal } = {}) {
    if (pending.has(id)) return pending.get(id);
    const row = manager.getAll().find((layer) => layer.id === id);
    if (!row?.enabled || signal?.aborted)
      return {
        id,
        skipped: true,
        message: 'Turn on this layer before reloading.',
      };
    if (finished.has(id) && now() - finished.get(id) < cooldownMs)
      return {
        id,
        skipped: true,
        message: 'Recently refreshed. Wait a few seconds before retrying.',
      };
    const work = Promise.resolve().then(async () => {
      try {
        const ok = await manager.refreshLayer(id, { signal });
        const latest = manager.getAll().find((layer) => layer.id === id);
        return { id, ok, message: layerActionMessage(latest) };
      } catch {
        return {
          id,
          ok: false,
          message:
            'Reload failed. Existing data is preserved; try again shortly.',
        };
      } finally {
        finished.set(id, now());
        pending.delete(id);
      }
    });
    pending.set(id, work);
    return work;
  }
  async function reloadEnabled({ signal, report = () => {} } = {}) {
    const ids = manager
      .getAll()
      .filter((row) => row.enabled)
      .map((row) => row.id);
    const results = [];
    let next = 0;
    async function worker() {
      while (next < ids.length && !signal?.aborted) {
        const result = await reload(ids[next++], { signal });
        results.push(result);
        report(results.length, ids.length, result);
      }
    }
    await Promise.all([worker(), worker()]);
    return results;
  }
  return { reload, reloadEnabled };
}
