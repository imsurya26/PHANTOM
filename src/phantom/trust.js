import { layerFeedState } from '../data/feedState.js';

/** Project existing layer telemetry without upgrading retrieval time to observation time. */
export function layerTrust(layer, now = Date.now()) {
  const stats = layer.stats || {};
  const retrievedAt =
    typeof stats.lastUpdate === 'number' ? stats.lastUpdate : null;
  const age =
    retrievedAt == null || !Number.isFinite(retrievedAt)
      ? null
      : Math.max(0, now - retrievedAt);
  const freshness =
    age == null
      ? 'Update time unavailable'
      : age < 60_000
        ? 'Fetched less than a minute ago'
        : `Fetched ${Math.floor(age / 60_000)} min ago`;
  let state = 'Off';
  if (layer.lifecycleState === 'enabling' || stats.loading) state = 'Loading';
  else if (stats.keyRequired || stats.missingKey) state = 'Unavailable';
  else if (layer.enabled) {
    if (
      stats.unavailable ||
      stats.available === false ||
      ['unavailable', 'offline', 'error'].includes(stats.status)
    )
      state = 'Unavailable';
    else if (stats.stale || stats.degraded || stats.lastError || stats.error)
      state = 'Degraded';
    else state = 'Enabled';
  }
  const status = String(
    stats.transportStatus || stats.status || '',
  ).toLowerCase();
  const feed = layerFeedState(stats);
  let explanation = layer.enabled
    ? 'Latest available source data. Coverage varies by location.'
    : 'Turn on to request data for this layer.';
  if (stats.keyRequired || stats.missingKey || status === 'not-configured') {
    state = 'Not configured';
    explanation =
      'This source has not been configured by the installation owner.';
  } else if (status === 'auth-failed' || status === 'unauthorized') {
    state = 'Access denied';
    explanation =
      'The provider rejected access. The owner needs to check its configuration.';
  } else if (status === 'rate-limited' || status === '429') {
    state = 'Waiting';
    explanation =
      'The provider has limited requests. Data will retry on its normal schedule.';
  } else if (state === 'Loading') {
    explanation = 'Requesting data from the source.';
  } else if (layer.enabled && status === 'zoom-in') {
    state = 'Zoom in';
    explanation = 'Move closer to a place to load local coverage.';
  } else if (layer.enabled && status === 'empty') {
    state = 'No results';
    explanation =
      'The source returned no records for this view. This does not establish that no activity exists.';
  } else if (layer.enabled && feed === 'fallback') {
    state = 'Alternative source';
    explanation = 'An alternative source is in use; coverage may differ.';
  } else if (layer.enabled && feed === 'partial') {
    state = 'Partial coverage';
    explanation = 'Only part of the requested coverage is available.';
  } else if (
    state === 'Unavailable' ||
    (layer.enabled && feed === 'unavailable')
  ) {
    state = 'Unavailable';
    explanation =
      'This source is not responding with usable data. Other layers remain available.';
  } else if (
    state === 'Degraded' ||
    (layer.enabled && ['stale', 'degraded'].includes(feed))
  ) {
    state = 'Degraded';
    explanation =
      'Updates are delayed or incomplete. Previously retrieved data may still be shown.';
  }
  if (layer.id === 'local-adsb' && layer.enabled && status === 'idle') {
    state = 'Receiver required';
    explanation =
      'Local ADS-B needs a connected radio receiver or decoder feed. Use Live Flights for aircraft without additional hardware.';
  } else if (layer.id === 'ais-live-vessels' && state === 'Unavailable') {
    explanation =
      'Live vessels need a continuously connected AIS collector. An API key alone cannot provide the stream on this deployment.';
  }
  return {
    id: layer.id,
    name: layer.name || layer.id,
    source: stats.source || layer.source || 'Source not reported',
    state,
    explanation,
    count:
      Number.isFinite(stats.count) && stats.count >= 0 ? stats.count : null,
    freshness,
    retrievedAt,
  };
}
