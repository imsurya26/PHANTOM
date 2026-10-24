import { resolveGoogleServerKey } from '../../../scripts/google-server-key.mjs';

/**
 * Optional Google place context is an empty capability when no key is present,
 * not a server outage. Returning 200 keeps a deliberately keyless session out
 * of the browser error console while preserving an explicit configured flag.
 */
export function keylessGooglePlacesResponse(apiKey) {
  if (String(apiKey ?? '').trim()) return null;
  return {
    statusCode: 200,
    payload: { configured: false, error: null, places: [] },
  };
}

/**
 * Server-only Places API (New) credential. Never substitute the browser's
 * Map Tiles-only key or reuse this credential for Street View Static.
 */
export function googleServerApiKey() {
  return resolveGoogleServerKey(process.env);
}
