import { createCctvCatalog } from '../providers/cctv/catalog.js';
import {
  fetchCctvImageFromUpstream,
  fetchTxdotSnapshot,
} from '../providers/cctv/media.js';
import { fetchTile } from '../providers/mapillary/tiles.js';
import { sendJson } from './admission.js';

/** Registered catalog images only. No arbitrary URL proxy or synthetic footage. */
export function createCameraHandler({
  env = process.env,
  catalog = createCctvCatalog(),
  fetchImpl = fetch,
  tile = fetchTile,
  now = Date.now,
} = {}) {
  const frames = new Map(),
    pending = new Map();
  let active = 0;
  return async (req, res) => {
    const path = req.url.split('?')[0];
    if (!path.startsWith('/api/cctv/') && !path.startsWith('/api/mapillary/'))
      return false;
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'GET required' });
      return true;
    }
    if (path === '/api/mapillary/status') {
      sendJson(res, 200, { configured: Boolean(env.MAPILLARY_CLIENT_TOKEN) });
      return true;
    }
    const mapTile =
      /^\/api\/mapillary\/tiles\/(coverage)\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})$/.exec(
        path,
      );
    if (mapTile) {
      if (!env.MAPILLARY_CLIENT_TOKEN) {
        sendJson(res, 503, { error: 'no_key', keyRequired: true });
        return true;
      }
      try {
        const { bytes } = await tile({
          layer: mapTile[1],
          z: mapTile[2],
          x: mapTile[3],
          y: mapTile[4],
        });
        if (bytes.length > 4_000_000) throw Error('oversized');
        res.statusCode = bytes.length ? 200 : 204;
        res.setHeader('Content-Type', 'application/x-protobuf');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.end(bytes.length ? bytes : undefined);
      } catch (error) {
        sendJson(
          res,
          error.keyRejected ? 403 : error.status === 400 ? 400 : 503,
          {
            error: 'Street imagery coverage is temporarily unavailable.',
            keyRejected: error.keyRejected === true,
          },
        );
      }
      return true;
    }
    if (path === '/api/cctv/health') {
      sendJson(res, 200, { cameras: [] });
      return true;
    }
    const match =
      /^\/api\/cctv\/(frame|media|stream)\/([A-Za-z0-9_-]{1,160})$/.exec(path);
    if (path !== '/api/cctv/sources' && !match) {
      sendJson(res, 404, { error: 'Unknown camera route' });
      return true;
    }
    const sources = (await catalog()).filter(
      (source) =>
        source.snapshotUrl || (source.feedType === 'image' && source.url),
    );
    if (path === '/api/cctv/sources') {
      // Explicit field allowlist: configured source URLs may contain credentials.
      const fields = [
        'id',
        'pack',
        'name',
        'city',
        'cityId',
        'provider',
        'lat',
        'lon',
        'headingDeg',
        'headingConfidence',
        'pitchDeg',
        'fovDeg',
        'rangeM',
        'mountHeightM',
        'groundElevationM',
        'poseSource',
        'license',
        'credit',
        'code',
        'groundHeights',
      ];
      sendJson(res, sources.length ? 200 : 503, {
        sources: sources.map((source) => ({
          ...Object.fromEntries(
            fields
              .filter((key) => source[key] !== undefined)
              .map((key) => [key, source[key]]),
          ),
          feedType: 'image',
          sourceKind: 'snapshot',
        })),
        trimmedPacks: catalog.trimmedPacks?.() || [],
      });
      return true;
    }
    const source = sources.find((source) => source.id === match[2]);
    if (!source) {
      sendJson(res, 404, { error: 'Camera not found' });
      return true;
    }
    if (match[1] === 'stream') {
      sendJson(res, 200, {
        id: source.id,
        feedType: 'image',
        frameUrl: `/api/cctv/frame/${source.id}`,
        mediaUrl: null,
        provider: source.provider,
        sourceKind: 'snapshot',
      });
      return true;
    }
    let frame = frames.get(source.id);
    if (!frame || now() - frame.at > 15000) {
      if (!pending.has(source.id)) {
        if (active >= 6) {
          sendJson(res, 429, { error: 'Camera requests busy. Retry shortly.' });
          return true;
        }
        active++;
        pending.set(
          source.id,
          (async () => {
            const url = source.snapshotUrl || source.url;
            const options = { fetchImpl, timeoutMs: 8000, maxBytes: 3_800_000 };
            const image = url.startsWith(
              'https://its.txdot.gov/its/DistrictIts/GetCctvSnapshotByIcdId',
            )
              ? await fetchTxdotSnapshot(url, options)
              : await fetchCctvImageFromUpstream(url, options);
            const entry = { at: now(), image };
            frames.set(source.id, entry);
            while (frames.size > 24) frames.delete(frames.keys().next().value);
            return entry;
          })().finally(() => {
            active--;
            pending.delete(source.id);
          }),
        );
      }
      frame = await pending.get(source.id);
    }
    if (!frame?.image) {
      sendJson(res, 503, {
        error:
          'Camera snapshot unavailable. Other cameras may still be available.',
      });
      return true;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', frame.image.contentType);
    res.setHeader('Cache-Control', 'public, max-age=15');
    res.setHeader('X-CCTV-Source', 'live');
    res.end(frame.image.body);
    return true;
  };
}
