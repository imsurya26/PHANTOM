import fs from 'node:fs/promises';
import puppeteer from 'puppeteer';
const label = process.argv[2] || 'audit';
const browser = await puppeteer.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: [
    '--no-sandbox',
    ...(process.env.PHANTOM_QA_SOFTWARE_GPU === '1'
      ? ['--use-gl=angle', '--use-angle=swiftshader']
      : []),
  ],
});
const report = { label, at: new Date().toISOString(), cases: [] };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable');
  await cdp.send('Profiler.enable');
  await cdp.send('Network.enable');
  let requests = 0,
    bytes = 0,
    wsFrames = 0;
  page.on('request', () => requests++);
  cdp.on('Network.loadingFinished', (e) => (bytes += e.encodedDataLength));
  cdp.on('Network.webSocketFrameReceived', () => wsFrames++);
  await page.evaluateOnNewDocument(() => {
    const intervals = new Set(),
      timeouts = new Set();
    const si = window.setInterval.bind(window),
      ci = window.clearInterval.bind(window),
      st = window.setTimeout.bind(window),
      ct = window.clearTimeout.bind(window);
    window.setInterval = (fn, ms, ...args) => {
      const id = si(fn, ms, ...args);
      intervals.add(id);
      return id;
    };
    window.clearInterval = (id) => {
      intervals.delete(id);
      timeouts.delete(id);
      ci(id);
    };
    window.setTimeout = (fn, ms, ...args) => {
      let id;
      id = st(
        typeof fn === 'function'
          ? () => {
              timeouts.delete(id);
              fn(...args);
            }
          : fn,
        ms,
      );
      timeouts.add(id);
      return id;
    };
    window.clearTimeout = (id) => {
      timeouts.delete(id);
      intervals.delete(id);
      ct(id);
    };
    const tasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        tasks.push({ start: e.startTime, duration: e.duration });
        if (tasks.length > 1000) tasks.shift();
      }
    }).observe({ type: 'longtask', buffered: true });
    window.__rescueAudit = { intervals, timeouts, tasks };
  });
  const started = Date.now();
  await page.goto(
    process.env.QA_BASE_URL || 'http://127.0.0.1:4183/?welcome=0',
    { waitUntil: 'domcontentloaded', timeout: 90000 },
  );
  await page.waitForFunction(
    () =>
      window.__godsEyeView &&
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 90000 },
  );
  report.readyMs = Date.now() - started;
  await page.waitForFunction(
    () => !window.__godsEyeView.viewer.camera._currentFlight,
    { timeout: 30000 },
  );
  report.renderer = await page.evaluate(() => {
    const gl = window.__godsEyeView.viewer.scene.context._gl;
    const e = gl.getExtension('WEBGL_debug_renderer_info');
    return e
      ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
  });
  console.log('renderer', report.renderer);
  async function sample(name, moving) {
    const before = Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map((x) => [
        x.name,
        x.value,
      ]),
    );
    const r = requests,
      b = bytes,
      w = wsFrames;
    await cdp.send('Profiler.start');
    const scene = await page.evaluate(async (moving) => {
      const app = window.__godsEyeView,
        v = app.viewer,
        a = window.__rescueAudit;
      let frames = 0;
      const start = performance.now();
      const stop = v.scene.postRender.addEventListener(() => frames++);
      await new Promise((resolve) => {
        const tick = () => {
          if (moving) v.camera.rotateRight(0.0004);
          if (performance.now() - start < 8000) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      stop();
      const gl = v.scene.context._gl;
      return {
        seconds: (performance.now() - start) / 1000,
        frames,
        dom: document.querySelectorAll('*').length,
        intervals: a.intervals.size,
        timeouts: a.timeouts.size,
        longTasks: a.tasks.filter((t) => t.start >= start),
        entities: v.entities.values.length,
        primitives: v.scene.primitives.length,
        canvas: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        governor: app.getRenderGovernorDiagnostics(),
        layers: app.dataManager
          .getAll()
          .filter((l) => l.enabled)
          .map((l) => ({ id: l.id, stats: l.stats })),
      };
    }, moving);
    const { profile } = await cdp.send('Profiler.stop');
    const after = Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map((x) => [
        x.name,
        x.value,
      ]),
    );
    const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
    const hits = new Map();
    for (let i = 0; i < (profile.samples || []).length; i++) {
      const id = profile.samples[i];
      hits.set(id, (hits.get(id) || 0) + (profile.timeDeltas?.[i] || 0));
    }
    const top = [...hits]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([id, us]) => {
        const f = nodes.get(id).callFrame;
        return {
          name: f.functionName,
          url: f.url.split('?')[0],
          line: f.lineNumber + 1,
          ms: us / 1000,
        };
      });
    const row = {
      name,
      ...scene,
      fps: scene.frames / scene.seconds,
      mainThreadPercent:
        ((after.TaskDuration - before.TaskDuration) /
          (after.Timestamp - before.Timestamp)) *
        100,
      heapBytes: after.JSHeapUsedSize,
      eventListeners: after.JSEventListeners,
      requests: requests - r,
      bytes: bytes - b,
      wsFrames: wsFrames - w,
      top,
    };
    report.cases.push(row);
    console.log(JSON.stringify(row));
  }
  await page.evaluate(async () => {
    for (const l of window.__godsEyeView.dataManager.getAll())
      if (l.enabled)
        await window.__godsEyeView.dataManager.setEnabled(l.id, false);
  });
  await sample('empty-idle', false);
  await sample('empty-moving', true);
  await page.evaluate(() =>
    window.__godsEyeView.dataManager.setEnabled('flights', true, {
      origin: 'user',
    }),
  );
  await sample('aircraft-moving', true);
  await sample('aircraft-settled', false);
  if (process.env.PHANTOM_QA_EXTENDED === '1') {
    for (const [id, name] of [
      ['ais-live-vessels', 'aircraft-and-ships'],
      ['weather-radar', 'with-weather'],
      ['local-firms', 'with-fires'],
      ['earthquakes', 'multiple-layers'],
    ]) {
      await page.evaluate(
        (id) =>
          window.__godsEyeView.dataManager.setEnabled(id, true, {
            origin: 'user',
          }),
        id,
      );
      await sample(name, true);
    }
    await page.evaluate(() =>
      document.querySelector('.phantom-nav [data-section="Analysis"]').click(),
    );
    await sample('nexus-panel', false);
    await page.keyboard.press('Escape');
    await page.evaluate(() =>
      window.__godsEyeView.styleManager.setPanelCollapsed(
        'street-level-panel',
        false,
        { explicit: true, persist: false },
      ),
    );
    await sample('street-panel', false);
    await page.setViewport({ width: 390, height: 844 });
    await sample('mobile-viewport', true);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await sample('cpu-throttled-4x', true);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  await page.evaluate(() =>
    Promise.all(
      window.__godsEyeView.dataManager
        .getAll()
        .filter((l) => l.enabled)
        .map((l) =>
          window.__godsEyeView.dataManager.setEnabled(l.id, false, {
            origin: 'user',
          }),
        ),
    ),
  );
  await sample('disabled-again', false);
} finally {
  await fs.mkdir('qa-artifacts/rescue', { recursive: true });
  await fs.writeFile(
    `qa-artifacts/rescue/${label}.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
