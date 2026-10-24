import { MAP_STACKS } from './catalog.js';
import { photorealUnavailableReason } from './availability.js';
import { keySetupRequirement } from '../keySetupCore.mjs';
import {
  createOsmImagery,
  createEsriImagery,
  createIonImagery,
  ESRI_ATTRIBUTION_HTML,
} from './imagery.js';
import { createWorldTerrain, createKeylessTerrain } from './terrain.js';
import * as Cesium from 'cesium';
import { loadPhotorealisticTileset } from './google3d.js';
import { classifyMapFailure } from './diagnostics.js';

/** Select sources and setup guidance without putting provider branches in the controller. */
export function createDefaultMapSources({
  googleTileset = null,
  cesiumToken = '',
  googleApiKey = '',
  googleTokens = null,
  googleStartupError = null,
} = {}) {
  const ionToken = String(cesiumToken || '').trim();
  const hasIon = Boolean(ionToken);
  const hasGoogle = Boolean(String(googleApiKey || '').trim());
  const terrain = {
    id: hasIon ? 'world' : 'keyless',
    create: hasIon
      ? (request) => createWorldTerrain(ionToken, request)
      : createKeylessTerrain,
  };
  return {
    defaultId: googleTileset ? 'photoreal' : 'esri-imagery',
    unknownId: 'photoreal',
    recoveryId: 'osm',
    state: { hasCesiumIonToken: hasIon },
    sources: MAP_STACKS.map((descriptor) => {
      const common = {
        descriptor,
        available: !descriptor.requiresIon || hasIon,
        unavailableReason: descriptor.requiresIon
          ? keySetupRequirement('cesium-ion')
          : null,
        diagnostic: {
          code:
            descriptor.requiresIon && !hasIon
              ? 'CREDENTIAL_MISSING'
              : 'NOT_VERIFIED',
          httpStatus: null,
        },
      };
      if (descriptor.kind === 'photoreal')
        return {
          ...common,
          available: Boolean(googleTileset || hasIon || hasGoogle),
          unavailableReason: photorealUnavailableReason(hasIon || hasGoogle),
          tileset: googleTileset,
          diagnostic:
            googleStartupError && (hasIon || hasGoogle)
              ? classifyMapFailure(googleStartupError)
              : {
                  code: googleTileset
                    ? 'ROOT_LOADED'
                    : hasIon || hasGoogle
                      ? 'NOT_VERIFIED'
                      : 'CREDENTIAL_MISSING',
                  httpStatus: null,
                },
          createTileset: async ({ signal } = {}) => {
            signal?.throwIfAborted();
            const result = await loadPhotorealisticTileset(Cesium, {
              googleApiKey,
              cesiumToken: ionToken,
              googleTokens,
            });
            if (!result.tileset)
              throw result.errors.at(-1) || new Error('Map unavailable');
            return result.tileset;
          },
          tileFailureFallback: {
            id: 'osm',
            threshold: 3,
            message:
              'Google 3D is temporarily unavailable. PHANTOM switched to the standard globe.',
          },
        };
      const imagery =
        descriptor.kind === 'ion'
          ? () => createIonImagery(descriptor.style, ionToken)
          : descriptor.id === 'osm'
            ? createOsmImagery
            : createEsriImagery;
      return {
        ...common,
        imagery,
        terrain,
        ...(descriptor.id === 'esri-imagery'
          ? {
              credit: ESRI_ATTRIBUTION_HTML,
              constructionFallback: {
                id: 'osm',
                message: 'Esri Satellite is unavailable; using OSM',
              },
              tileFailureFallback: {
                id: 'osm',
                threshold: 2,
                message: 'Esri Satellite tile requests failed; using OSM',
              },
            }
          : {}),
      };
    }),
  };
}
