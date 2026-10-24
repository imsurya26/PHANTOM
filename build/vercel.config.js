import { defineConfig } from 'vite';
import { createBrowserViteConfig } from './vite.js';

// The deployed API is a separate Node function. Never initialize local Vite
// provider middleware or load developer dotenv files while building this entry.
export default defineConfig(({ command }) =>
  createBrowserViteConfig({
    command,
    googleApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    cesiumToken: process.env.CESIUM_ION_TOKEN || '',
    mapillaryToken: process.env.MAPILLARY_CLIENT_TOKEN || '',
  }),
);
