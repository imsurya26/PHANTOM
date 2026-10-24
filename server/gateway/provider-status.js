export const PROVIDER_STATES = Object.freeze([
  'AVAILABLE',
  'DEGRADED',
  'AUTH_ERROR',
  'RATE_LIMITED',
  'QUOTA_WARNING',
  'QUOTA_EXHAUSTED',
  'OUTAGE',
]);

export const PROVIDER_ENV = Object.freeze({
  firms: ['FIRMS_MAP_KEY'],
  openaq: ['OPENAQ_API_KEY'],
  aisstream: ['AISSTREAM_API_KEY'],
  gemini: ['GEMINI_API_KEY'],
  opensky: ['OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET'],
  tomtom: ['TOMTOM_API_KEY'],
  'google-places': ['GOOGLE_MAPS_SERVER_API_KEY'],
  'google-tiles': ['GOOGLE_MAPS_API_KEY'],
  cesium: ['CESIUM_ION_TOKEN'],
  mapillary: ['MAPILLARY_CLIENT_TOKEN'],
});

// Static metadata is safe to publish. Credentials and upstream messages never enter it.
export const ProviderRegistry = Object.freeze(
  [
    ['firms', 'NASA FIRMS', [], 300000],
    ['openaq', 'OpenAQ', [], 300000],
    ['aisstream', 'AISStream', [], 15000],
    ['gemini', 'Gemini voice', [], null],
    ['opensky', 'OpenSky', ['adsb-lol'], 12000],
    ['tomtom', 'TomTom traffic', [], 60000],
    ['google-places', 'Google Places', ['wikimedia'], null],
    ['google-tiles', 'Google 3D', ['free-map'], null],
    ['cesium', 'Cesium ion', ['free-map'], null],
    ['mapillary', 'Mapillary street imagery', [], null],
    ['adsb-lol', 'adsb.lol aircraft', [], 12000],
    ['gdelt', 'GDELT events', [], 600000],
    ['wikimedia', 'Wikimedia context', [], 600000],
    ['photon', 'Photon place search', ['nominatim'], null],
    ['nominatim', 'OpenStreetMap place search', [], null],
    ['usgs', 'USGS earthquakes', [], 60000],
    ['noaa', 'NOAA weather', [], 300000],
    ['free-map', 'Free globe', [], null],
  ].map(([id, name, fallback, expectedIntervalMs]) =>
    Object.freeze({
      id,
      name,
      requiresCredential: Object.hasOwn(PROVIDER_ENV, id),
      fallback: Object.freeze(fallback),
      expectedIntervalMs,
    }),
  ),
);

/** Fixed identifiers and codes only; never retain provider messages or credentials. */
export function createProviderStatus({
  env = process.env,
  now = Date.now,
} = {}) {
  const observations = new Map();
  const disabled = new Set(
    (env.PHANTOM_DISABLED_PROVIDERS || '').split(',').map((s) => s.trim()),
  );
  if (env.PHANTOM_GEMINI_ENABLED === '0' || env.PHANTOM_PUBLIC_MODE === '1')
    disabled.add('gemini');
  const configured = (id) =>
    PROVIDER_ENV[id]?.every((name) => Boolean(env[name]?.trim())) || false;
  const known = new Set(ProviderRegistry.map((provider) => provider.id));
  return {
    disabled(id) {
      return disabled.has(id);
    },
    enabled(id) {
      return (
        known.has(id) &&
        (!PROVIDER_ENV[id] || configured(id)) &&
        !disabled.has(id)
      );
    },
    record(id, state) {
      if (!known.has(id) || !PROVIDER_STATES.includes(state))
        throw new TypeError('Invalid provider status');
      observations.set(id, { state, checkedAt: new Date(now()).toISOString() });
    },
    snapshot() {
      return ProviderRegistry.map((provider) => {
        const { id } = provider;
        const observation = observations.get(id);
        const fresh =
          observation && now() - Date.parse(observation.checkedAt) < 5 * 60_000;
        const reason = disabled.has(id)
          ? 'disabled'
          : provider.requiresCredential && !configured(id)
            ? 'not-configured'
            : fresh
              ? 'observed'
              : 'not-verified';
        return {
          id,
          name: provider.name,
          requiresCredential: provider.requiresCredential,
          credentialConfigured: configured(id),
          status:
            reason === 'disabled'
              ? 'DISABLED'
              : reason === 'not-configured'
                ? 'OPTIONAL'
                : reason === 'observed'
                  ? observation.state
                  : 'NOT_VERIFIED',
          fallback: [...provider.fallback],
          dataFreshness: {
            expectedIntervalMs: provider.expectedIntervalMs,
            observedAt: null,
          },
          quotaState:
            reason === 'observed' &&
            ['RATE_LIMITED', 'QUOTA_WARNING', 'QUOTA_EXHAUSTED'].includes(
              observation.state,
            )
              ? observation.state
              : 'UNKNOWN',
          errorState:
            reason === 'observed' &&
            ['AUTH_ERROR', 'OUTAGE'].includes(observation.state)
              ? observation.state
              : null,
          configured: configured(id),
          state: reason === 'observed' ? observation.state : 'DEGRADED',
          reason,
          checkedAt: observation?.checkedAt ?? null,
        };
      });
    },
  };
}

export function providerStatusPlugin(status) {
  const install = (server) => {
    server.middlewares.use((req, res, next) => {
      if (
        !['/api/phantom/provider-status', '/api/providers/status'].includes(
          req.url,
        )
      )
        return next();
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json');
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET');
        return res.end(JSON.stringify({ error: 'GET required' }));
      }
      res.end(JSON.stringify({ providers: status.snapshot() }));
    });
  };
  return {
    name: 'phantom-provider-status',
    configureServer: install,
    configurePreviewServer: install,
  };
}
