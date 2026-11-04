import { defineConfig } from 'vite';
import { createBrowserViteConfig } from './vite.js';

// The deployed API is a separate Node function. Never initialize local Vite
// provider middleware or load developer dotenv files while building this entry.
export default defineConfig(({ command }) => {
  const disabled = new Set(
    (process.env.PHANTOM_DISABLED_PROVIDERS || '')
      .split(',')
      .map((value) => value.trim()),
  );
  return createBrowserViteConfig({
    command,
    googleApiKey: disabled.has('google-tiles')
      ? ''
      : process.env.GOOGLE_MAPS_API_KEY || '',
    cesiumToken: disabled.has('cesium')
      ? ''
      : process.env.CESIUM_ION_TOKEN || '',
    mapillaryToken: disabled.has('mapillary')
      ? ''
      : process.env.MAPILLARY_CLIENT_TOKEN || '',
  });
});
