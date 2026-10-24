import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const browser = await puppeteer.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
});
const results = [];
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    const media = [];
    page.on('request', (r) => {
      if (/\/api\/cctv\/(frame|media)\//.test(r.url())) media.push(r.url());
    });
    await page.goto('http://127.0.0.1:4183/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForFunction(
      () => window.__godsEyeView?.dataManager?.layers?.get('cctv'),
      { timeout: 60000 },
    );
    const camera = await page.evaluate(async () => {
      const app = window.__godsEyeView;
      await app.dataManager.toggle('cctv');
      const mod = app.dataManager.layers.get('cctv').module;
      const cams = mod.getUIState().cameras;
      const cam =
        cams.find((c) => c.id.toLowerCase().includes('fintraffic')) ||
        cams.find((c) => c.provider?.includes('Fintraffic')) ||
        cams[0];
      mod.setParams({ selectedCameraId: cam.id });
      app.styleManager.setPanelCollapsed('cctv-panel', false, {
        explicit: true,
        persist: false,
      });
      return { id: cam.id, name: cam.name, provider: cam.provider };
    });
    await new Promise((r) => setTimeout(r, 1000));
    assert.equal(media.length, 0, 'camera selection must not load media');
    console.log(
      'watch-state',
      JSON.stringify(
        await page.evaluate(() => {
          const b = document.querySelector(
            '[aria-label="Watch selected public camera"]',
          );
          return {
            exists: !!b,
            disabled: b?.disabled,
            rect: b?.getBoundingClientRect().toJSON(),
            panel: document.querySelector('#cctv-panel')?.className,
          };
        }),
      ),
    );
    await page.screenshot({
      path: 'qa-artifacts/rescue/cctv-before-watch.png',
    });
    await page.locator('[aria-label="Watch selected public camera"]').click();
    await page.waitForFunction(
      () => document.querySelector('#cctv-frame')?.naturalWidth > 0,
      { timeout: 35000 },
    );
    const loaded = await page.evaluate(() => ({
      width: document.querySelector('#cctv-frame').naturalWidth,
      height: document.querySelector('#cctv-frame').naturalHeight,
      watching: window.__godsEyeView.dataManager.layers
        .get('cctv')
        .module.getUIState().activeCamera.watching,
    }));
    assert.equal(loaded.watching, true);
    await page.locator('[aria-label="Watch selected public camera"]').click();
    const closed = await page.evaluate(() => {
      const app = window.__godsEyeView;
      const mod = app.dataManager.layers.get('cctv').module;
      return {
        watching: mod.getUIState().activeCamera.watching,
        video: !!mod.getActiveVideoElement(),
        frame: document.querySelector('#cctv-frame').getAttribute('src'),
        plane: !!app.viewer.entities.getById(
          'cctv-' + mod.getUIState().activeCameraId + '-plane',
        ),
      };
    });
    assert.deepEqual(closed, {
      watching: false,
      video: false,
      frame: null,
      plane: false,
    });
    results.push({
      viewport,
      camera,
      loaded,
      closed,
      requests: media.length,
      note: 'Programmatic selection through real app layer; real Watch and Close clicks. Snapshot decode; not a video claim.',
    });
    await page.close();
  }
  console.log(JSON.stringify(results));
  await writeFile(
    'qa-artifacts/rescue/cctv-watch.json',
    JSON.stringify(results, null, 2),
  );
} finally {
  await browser.close();
}
