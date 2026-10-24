/** Repeatable real-browser samples. Software graphics results are not hardware FPS claims. */
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer';

const label = process.argv[2] || 'baseline';
const browser = await puppeteer.launch({
  headless: true,
  executablePath:
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
});
const report = {
  label,
  at: new Date().toISOString(),
  graphics: 'ANGLE SwiftShader software renderer',
  cases: [],
};
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable');
  let requests = 0,
    bytes = 0,
    sockets = 0;
  const paths = new Map();
  page.on('request', (r) => {
    requests++;
    const u = new URL(r.url());
    const key = u.origin + u.pathname;
    paths.set(key, (paths.get(key) || 0) + 1);
  });
  await cdp.send('Network.enable');
  cdp.on('Network.loadingFinished', (e) => {
    bytes += e.encodedDataLength;
  });
  cdp.on('Network.webSocketCreated', () => sockets++);
  const start = Date.now();
  await page.goto(
    process.env.QA_BASE_URL || 'http://127.0.0.1:4181/?welcome=0',
    { waitUntil: 'domcontentloaded', timeout: 60000 },
  );
  await page.waitForFunction(
    () =>
      window.__godsEyeView?.dataManager &&
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 90000 },
  );
  report.readyMs = Date.now() - start;
  await page.waitForFunction(
    () => !window.__godsEyeView.viewer.camera._currentFlight,
    { timeout: 30000 },
  );
  report.catalog = await page.evaluate(() =>
    window.__godsEyeView.dataManager
      .getAll()
      .map((l) => ({ id: l.id, name: l.name, enabled: l.enabled })),
  );
  async function sample(name, moving = false) {
    const before = Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map((m) => [
        m.name,
        m.value,
      ]),
    );
    const r0 = requests,
      b0 = bytes;
    const metrics = await page.evaluate(async (moving) => {
      const app = window.__godsEyeView,
        scene = app.viewer.scene;
      let raf = 0,
        renders = 0;
      const renderDone = scene.postRender.addEventListener(() => renders++);
      const start = performance.now();
      let last = start;
      const gaps = [];
      await new Promise((resolve) => {
        function tick(now) {
          gaps.push(now - last);
          last = now;
          raf++;
          if (moving) app.viewer.camera.rotateRight(0.0005);
          if (now - start < 5000) requestAnimationFrame(tick);
          else resolve();
        }
        requestAnimationFrame(tick);
      });
      renderDone();
      const elapsed = performance.now() - start;
      gaps.sort((a, b) => a - b);
      return {
        seconds: elapsed / 1000,
        rafFps: (raf * 1000) / elapsed,
        renderedFps: (renders * 1000) / elapsed,
        p95FrameMs: gaps[Math.floor(gaps.length * 0.95)],
        domNodes: document.querySelectorAll('*').length,
        heapBytes: performance.memory?.usedJSHeapSize,
        entities: app.viewer.entities.values.length,
        primitives: scene.primitives.length,
        imagery: app.viewer.imageryLayers.length,
        governor: app.getRenderGovernorDiagnostics?.(),
        layers: app.dataManager
          .getAll()
          .filter((l) => l.enabled)
          .map((l) => ({ id: l.id, stats: l.stats })),
      };
    }, moving);
    const after = Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map((m) => [
        m.name,
        m.value,
      ]),
    );
    const row = {
      name,
      ...metrics,
      cpuMeasurementSeconds: after.Timestamp - before.Timestamp,
      cpuMainThreadPercent:
        ((after.TaskDuration - before.TaskDuration) /
          (after.Timestamp - before.Timestamp)) *
        100,
      requests: requests - r0,
      networkBytes: bytes - b0,
      eventListeners: after.JSEventListeners,
    };
    report.cases.push(row);
    console.log(
      JSON.stringify({
        name,
        rafFps: row.rafFps,
        renderedFps: row.renderedFps,
        cpu: row.cpuMainThreadPercent,
        requests: row.requests,
        heapMB: row.heapBytes / 1048576,
        governor: row.governor,
      }),
    );
  }
  await page.evaluate(async () => {
    for (const l of window.__godsEyeView.dataManager.getAll())
      if (l.enabled)
        await window.__godsEyeView.dataManager.setEnabled(l.id, false);
  });
  await sample('empty-idle');
  await sample('empty-moving', true);
  for (const [name, ids] of [
    ['aircraft', ['flights']],
    ['aircraft-ships', ['ais-live-vessels']],
    ['weather', ['weather-radar']],
    ['fires', ['local-firms']],
    ['multi-layer', ['earthquakes', 'satellites']],
  ]) {
    const activation = await page.evaluate(async (ids) => {
      const dm = window.__godsEyeView.dataManager;
      return Promise.all(
        ids.map(async (id) => {
          if (!dm.layers.has(id)) return { id, unavailable: 'not registered' };
          try {
            await dm.setEnabled(id, true, { origin: 'user' });
            return { id, enabled: true };
          } catch {
            return { id, unavailable: 'activation failed' };
          }
        }),
      );
    }, ids);
    report.cases.push({ name: name + '-activation', activation });
    await sample(name, true);
  }
  for (const section of ['Analysis', 'Street View']) {
    await page.evaluate((section) => {
      const trigger = document.querySelector(`[data-section="${section}"]`);
      if (trigger) trigger.click();
      else {
        document.querySelector('[data-section="More"]')?.click();
        [...document.querySelectorAll('#phantom-drawer button')]
          .find((b) => b.textContent === section)
          ?.click();
      }
    }, section);
    await sample(section.toLowerCase().replaceAll(' ', '-'), true);
    await page.keyboard.press('Escape');
  }
  await page.setViewport({ width: 390, height: 844 });
  await sample('mobile-moving', true);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await sample('cpu-4x-moving', true);
  report.totalRequests = requests;
  report.totalBytes = bytes;
  report.webSockets = sockets;
  report.repeatedPaths = [...paths]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);
} finally {
  await fs.mkdir('qa-artifacts/performance', { recursive: true });
  await fs.writeFile(
    `qa-artifacts/performance/${label}.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
