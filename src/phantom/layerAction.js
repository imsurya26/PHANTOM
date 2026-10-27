import { layerTrust } from './trust.js';

export function layerActionMessage(layer) {
  if (!layer) return 'This layer is not available in this installation.';
  const trust = layerTrust(layer);
  return `${trust.name}: ${trust.state}${trust.count == null ? '' : ` · ${trust.count.toLocaleString()} records`}. ${trust.explanation}`;
}

/** Report both lifecycle failures and successful requests with empty results. */
export async function enableLayerWithFeedback({
  dataManager,
  id,
  signal,
  report,
}) {
  const publish = (message) => {
    if (!signal?.aborted) report(message);
  };
  publish('Requesting source data…');
  try {
    if (
      dataManager.getAll?.().find((layer) => layer.id === id)?.enabled &&
      dataManager.refreshLayer
    )
      await dataManager.refreshLayer(id, { signal });
    else await dataManager.setEnabled(id, true, { origin: 'user' });
    publish(
      layerActionMessage(dataManager.getAll().find((layer) => layer.id === id)),
    );
  } catch {
    publish(
      'This layer could not load. Try again later; other map layers remain available.',
    );
  }
}
