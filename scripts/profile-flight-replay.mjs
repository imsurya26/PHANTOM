// Developer-only replay. Captured observations are test fixtures, never live data.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer';

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:4191';
const label = process.argv[2] || 'baseline';
const dir = 'qa-artifacts/flight-replay';
await fs.mkdir(dir, { recursive: true });
const fixturePath = `${dir}/snapshot.json`;
let raw;
try {
  raw = await fs.readFile(fixturePath, 'utf8');
} catch {
  const response = await fetch(`${base}/api/flights?lat=30.2672&lon=-97.7431`);
  if (!response.ok) throw new Error(`Capture failed: ${response.status}`);
  raw = await response.text();
  const parsed = JSON.parse(raw);
  if (!parsed.states?.length)
    throw new Error('No observations available to capture');
  await fs.writeFile(fixturePath, raw);
}
const fixture = JSON.parse(raw);
const report = {
  label,
  capturedAt: new Date().toISOString(),
  fixture: crypto.createHash('sha256').update(raw).digest('hex'),
  records: fixture.states.length,
  purpose: 'TEST ONLY: replay of captured historical observations',
  cases: [],
  complete: false,
};
const browser = await puppeteer.launch({
  headless: true,
  userDataDir: `${dir}/browser-profile`,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--no-sandbox', '--disable-crash-reporter', '--disable-breakpad'],
});
try {
  report.browser = await browser.version();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.name || 'Error'));
  report.pageErrors = pageErrors;
  await page.setViewport({ width: 1440, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const u = new URL(request.url());
    // Controlled comparison seam: replay the previous exact Cesium math while
    // leaving every other app module, snapshot and camera setting identical.
    if (
      process.env.PHANTOM_REPLAY_BASELINE === '1' &&
      u.pathname.endsWith('/sphereVisibility.js')
    )
      return request.respond({
        status: 200,
        contentType: 'application/javascript',
        body: `import * as C from '/node_modules/.vite/deps/cesium.js';const sphere=new C.BoundingSphere();export function sphereIntersectsFrustum(v,p,r){sphere.center=p;sphere.radius=r;return v.computeVisibility(sphere)!==C.Intersect.OUTSIDE;}`,
      });
    if (
      process.env.PHANTOM_REPLAY_BASELINE === '1' &&
      u.pathname.endsWith('/fixFrame.js')
    )
      return request.respond({
        status: 200,
        contentType: 'application/javascript',
        body: `import * as C from '/node_modules/.vite/deps/cesium.js';export function createFixFrameCache(){const out=new C.Matrix4();return fix=>C.Transforms.eastNorthUpToFixedFrame(fix.position,C.Ellipsoid.WGS84,out);}`,
      });
    if (u.pathname === '/api/flights')
      return request.respond({
        status: 200,
        contentType: 'application/json',
        body: raw,
      });
    // Enrichment is outside this deterministic fleet-rendering experiment.
    if (/\/api\/flights\//.test(u.pathname))
      return request.respond({
        status: 503,
        contentType: 'application/json',
        body: '{}',
      });
    return request.continue();
  });
  await page.evaluateOnNewDocument((epoch) => {
    const start = performance.now();
    Date.now = () => epoch + performance.now() - start;
  }, fixture.time * 1000);
  await page.goto(`${base}/?welcome=0`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForFunction(
    () =>
      window.__godsEyeView &&
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 90000 },
  );
  await page.evaluate(() => {
    const v = window.__godsEyeView.viewer;
    v.camera.cancelFlight();
    v.camera.setView({
      destination: v.scene.globe.ellipsoid.cartographicToCartesian({
        longitude: (-97.7431 * Math.PI) / 180,
        latitude: (30.2672 * Math.PI) / 180,
        height: 150000,
      }),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    });
  });
  report.camera = { longitude: -97.7431, latitude: 30.2672, height: 150000 };
  report.math =
    process.env.PHANTOM_REPLAY_BASELINE === '1'
      ? 'prior-cesium-path'
      : 'optimized-exact-math';
  await page.evaluate(async () => {
    for (const layer of window.__godsEyeView.dataManager.getAll())
      if (layer.enabled)
        await window.__godsEyeView.dataManager.setEnabled(layer.id, false);
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable');
  await cdp.send('Profiler.enable');
  report.renderer = await page.evaluate(() => {
    const gl = window.__godsEyeView.viewer.scene.context._gl;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  });
  await page.evaluate(() =>
    window.__godsEyeView.dataManager.setEnabled('flights', true, {
      origin: 'user',
    }),
  );
  await page.waitForFunction(
    () =>
      window.__godsEyeView.dataManager.layers.get('flights').module.getStats()
        .count > 0,
    { timeout: 60000 },
  );
  // Compile and upload before sampling; shader startup must not masquerade as steady-state work.
  await new Promise((resolve) => setTimeout(resolve, 8000));
  await page.evaluate(async () => {
    const v = window.__godsEyeView.viewer;
    const pose = {
      destination: v.camera.position.clone(),
      orientation: {
        direction: v.camera.direction.clone(),
        up: v.camera.up.clone(),
      },
    };
    await new Promise((resolve) => {
      const start = performance.now();
      let prev = start;
      const tick = () => {
        const now = performance.now();
        v.camera.rotateRight((now - prev) * 0.00002);
        prev = now;
        if (now - start < 9000) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    v.camera.setView(pose);
  });
  for (const rate of [1, 4]) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const before = Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map((m) => [
        m.name,
        m.value,
      ]),
    );
    await cdp.send('Profiler.start');
    const data = await page.evaluate(async () => {
      const { viewer: v, dataManager } = window.__godsEyeView;
      const pose = {
        destination: v.camera.position.clone(),
        orientation: {
          direction: v.camera.direction.clone(),
          up: v.camera.up.clone(),
        },
      };
      let frames = 0;
      const remove = v.scene.postRender.addEventListener(() => frames++);
      const start = performance.now();
      const tasks = [];
      const observer = new PerformanceObserver((list) =>
        tasks.push(...list.getEntries().map((e) => e.duration)),
      );
      observer.observe({ type: 'longtask' });
      await new Promise((resolve) => {
        let prev = start;
        const tick = () => {
          const now = performance.now();
          v.camera.rotateRight((now - prev) * 0.00002);
          prev = now;
          if (now - start < 8000) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      remove();
      observer.disconnect();
      v.camera.setView(pose);
      return {
        frames,
        seconds: (performance.now() - start) / 1000,
        longTasks: tasks,
        stats: dataManager.layers.get('flights').module.getStats(),
      };
    });
    const { profile } = await cdp.send('Profiler.stop');
    await fs.writeFile(
      `${dir}/${label}-${rate}x.cpuprofile`,
      JSON.stringify(profile),
    );
    const after = Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map((m) => [
        m.name,
        m.value,
      ]),
    );
    const hits = new Map();
    for (let i = 0; i < profile.samples.length; i++)
      hits.set(
        profile.samples[i],
        (hits.get(profile.samples[i]) || 0) + profile.timeDeltas[i],
      );
    const nodes = new Map(profile.nodes.map((n) => [n.id, n.callFrame]));
    const row = {
      rate,
      ...data,
      fps: data.frames / data.seconds,
      cpuPercent:
        (100 * (after.TaskDuration - before.TaskDuration)) /
        (after.Timestamp - before.Timestamp),
      heapBytes: after.JSHeapUsedSize,
      top: [...hits]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([id, us]) => ({ ...nodes.get(id), ms: us / 1000 })),
    };
    report.cases.push(row);
    console.log(JSON.stringify(row));
  }
  report.complete = report.cases.length === 2;
} finally {
  await fs.writeFile(`${dir}/${label}.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
if (report.cases.some((row) => row.fps < (row.rate === 1 ? 55 : 30))) {
  console.error('PERFORMANCE BUDGET FAILED (55 desktop / 30 throttled)');
  process.exitCode = 1;
}
