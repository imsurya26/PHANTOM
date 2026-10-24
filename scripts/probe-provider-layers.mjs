// Real, keyless endpoint checks. Only bounded status/count summaries are printed.
import { GBFS_CITY_REGISTRY } from '../src/layers/bikeshare/registry.js';
import { fetchGbfsUpstream } from '../server/providers/gbfs.js';
import { launchLibraryRecentUrl } from '../src/data/spaceProviderRequests.js';
import { firePerimetersProxy } from '../server/providers/firePerimeters.js';
import { loadEnv } from 'vite';
import { PROVIDER_ENV } from '../server/gateway/provider-status.js';
const env = { ...loadEnv('development', process.cwd(), ''), ...process.env };
console.log(
  JSON.stringify({
    credentials: Object.fromEntries(
      Object.entries(PROVIDER_ENV).map(([id, names]) => [
        id,
        names.every((name) => Boolean(env[name]?.trim())),
      ]),
    ),
  }),
);
const chosen = GBFS_CITY_REGISTRY.filter((p) => /austin|nyc|boston/.test(p.id));
const checks = chosen.map((p) => ({
  name: `GBFS ${p.id}`,
  run: async () => {
    const r = await fetchGbfsUpstream(p.stationInformationUrl);
    const data = JSON.parse(r.body);
    return { status: r.status, records: data?.data?.stations?.length ?? 0 };
  },
}));
checks.push({
  name: 'Space missions',
  run: async () => {
    const r = await fetch(launchLibraryRecentUrl(new Date()), {
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json();
    return { status: r.status, records: data.results?.length ?? 0 };
  },
});
checks.push({
  name: 'Fire perimeters backend',
  run: async () => {
    let handler;
    firePerimetersProxy().configureServer({
      middlewares: {
        use(path, fn) {
          if (path === '/api/fire-perimeters') handler = fn;
        },
      },
    });
    let status = 200,
      data;
    await handler(
      {
        url: '/',
        method: 'GET',
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      },
      {
        writeHead(code) {
          status = code;
        },
        end(body) {
          data = JSON.parse(body);
        },
      },
    );
    return { status, records: data?.rows?.length ?? 0 };
  },
});
for (const check of checks) {
  try {
    const result = await check.run();
    const pass = result.status === 200 && result.records > 0;
    console.log(JSON.stringify({ name: check.name, pass, ...result }));
    if (!pass) process.exitCode = 1;
  } catch (error) {
    console.log(
      JSON.stringify({
        name: check.name,
        pass: false,
        error: error.code || error.cause?.code || error.name,
      }),
    );
    process.exitCode = 1;
  }
}
