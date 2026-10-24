import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { resolveAllowedHosts } from '../../build/allowedHosts.js';
import { createBrowserViteConfig } from '../../build/vite.js';
import { localProviderPlugins } from '../providers/local.js';
import { localMcpPlugin } from '../mcp/plugin.js';
import { apiNotFoundPlugin } from './api-not-found.js';
import { standaloneVoiceTools } from './voiceTools.js';
import { gatewayPlugin } from '../gateway/index.js';
import { signalsPlugin } from '../providers/signals.js';
import { airQualityPlugin } from '../providers/airQuality.js';
import { geminiTokenPlugin } from '../providers/gemini.js';
import {
  createProviderStatus,
  providerStatusPlugin,
} from '../gateway/provider-status.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Load this checkout's configuration and attach its local provider middleware. */
export default defineConfig(({ command, mode }) => {
  const loaded = loadEnv(mode, root, '');
  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  const providerStatus = createProviderStatus();
  return createBrowserViteConfig({
    plugins: [
      gatewayPlugin(process.env, providerStatus),
      signalsPlugin(),
      airQualityPlugin({ status: providerStatus }),
      providerStatusPlugin(providerStatus),
      geminiTokenPlugin({ status: providerStatus }),
      ...localProviderPlugins({ realtime: { tools: standaloneVoiceTools() } }),
      localMcpPlugin(),
      apiNotFoundPlugin(),
    ],
    googleApiKey: providerStatus.disabled('google-tiles')
      ? ''
      : process.env.GOOGLE_MAPS_API_KEY,
    cesiumToken: providerStatus.disabled('cesium')
      ? ''
      : process.env.CESIUM_ION_TOKEN,
    mapillaryToken: providerStatus.disabled('mapillary')
      ? ''
      : process.env.MAPILLARY_CLIENT_TOKEN,
    host: process.env.HOST,
    port: process.env.PORT,
    allowedHosts: resolveAllowedHosts(process.env.GEV_ALLOWED_HOSTS),
    command,
  });
});
