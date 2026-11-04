import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { waitForPhantom, clickShellButton } from './qa-phantomShell.mjs';

const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || await puppeteer.executablePath(),
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${process.env.QA_BASE_URL || 'http://localhost:4186'}/?welcome=0`, { waitUntil: 'domcontentloaded' });
  await waitForPhantom(page);
  await page.evaluate(() => {
    window.__cameraErrors = [];
    window.__godsEyeView.viewer.scene.renderError.addEventListener((scene, error) => window.__cameraErrors.push(String(error)));
  });
  await clickShellButton(page, 'More');
  await clickShellButton(page, 'Camera views', '.phantom-drawer');
  await page.waitForSelector('[data-camera-mode="follow"]');
  assert.equal(await page.$eval('[data-camera-mode="follow"]', (button) => button.disabled), true);
  // A synthetic target exists only in this disposable browser test, never in a feed.
  await page.evaluate(async () => {
    const C = window.Cesium;
    const { viewer, dataManager } = window.__godsEyeView;
    const target = C.Cartesian3.fromDegrees(0, 0, 10000);
    const entity = viewer.entities.add({
      id: 'camera-qa-fixture',
      position: target,
      point: { pixelSize: 12, color: C.Color.YELLOW },
      viewFrom: new C.Cartesian3(0, -1200, 700),
    });
    entity.gevDisplayPosition = () => target;
    entity.gevTrackedId = 'flights:camera-qa-fixture';
    dataManager.layers.get('flights').module.getTrackedHeading = () => 90;
    // Finish the fixture's initial framing before testing mode transitions.
    // Production layer selection already performs this ownership handoff.
    await viewer.zoomTo(entity, new C.HeadingPitchRange(0, C.Math.toRadians(-25), 1400));
    viewer.trackedEntity = entity;
    viewer.scene.requestRender();
  });
  await page.waitForFunction(() => {
    const { viewer } = window.__godsEyeView;
    return window.Cesium.Cartesian3.magnitude(viewer.camera.position) < 10000;
  });
  await page.waitForFunction(() => !document.querySelector('[data-camera-mode="follow"]').disabled);
  const select = async (mode) => {
    await page.click(`[data-camera-mode="${mode}"]`);
    await page.waitForFunction((mode) => document.querySelector(`[data-camera-mode="${mode}"]`).getAttribute('aria-pressed') === 'true', {}, mode);
  };
  for (const mode of ['top-down', 'follow', 'chase', 'orbit', 'cinematic']) {
    await select(mode);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const frame = await page.evaluate(() => {
      const { viewer } = window.__godsEyeView;
      return { tracked: viewer.trackedEntity?.id, camera: [viewer.camera.positionWC.x, viewer.camera.positionWC.y, viewer.camera.positionWC.z], range: window.Cesium.Cartesian3.magnitude(viewer.camera.position) };
    });
    assert.equal(frame.tracked, 'camera-qa-fixture');
    assert.ok(frame.camera.every(Number.isFinite));
    assert.ok(frame.range >= 150 && frame.range < 10000, `safe tracked range for ${mode}: ${frame.range}`);
  }
  await page.mouse.move(1100, 600);
  await page.mouse.down();
  await page.mouse.move(1120, 600);
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[data-camera-mode="follow"]').getAttribute('aria-pressed') === 'true');
  await select('orbit');
  await page.evaluate(() => window.__godsEyeView.styleManager._runExplicitNavigation('QA handoff', () => true));
  await page.waitForFunction(() => document.querySelector('[data-camera-mode="free"]').getAttribute('aria-pressed') === 'true');
  assert.equal(await page.evaluate(() => Boolean(window.__godsEyeView.viewer.trackedEntity)), false);
  await mkdir('qa-artifacts/camera-views', { recursive: true });
  await page.evaluate(() => {
    const C = window.Cesium;
    window.__shipFixture = { id: 'qa-ship', position: C.Cartesian3.fromDegrees(0, 0, 2), heading: 90, stale: true };
    window.__godsEyeView.dataManager.layers.get('ais-live-vessels').module.getSelectedCameraTarget = () => window.__shipFixture;
  });
  await page.waitForFunction(() => !document.querySelector('[data-camera-mode="first-person"]').disabled);
  await select('first-person');
  await page.waitForFunction(() => window.__godsEyeView.viewer.camera.positionCartographic.height < 100);
  await page.waitForFunction(() => document.querySelector('.phantom-content').textContent.includes('cached position'));
  assert.ok(await page.evaluate(() => window.__godsEyeView.viewer.camera.positionCartographic.height >= 7.9));
  await page.evaluate(() => { window.__shipFixture = null; });
  await page.waitForFunction(() => document.querySelector('[data-camera-mode="free"]').getAttribute('aria-pressed') === 'true');
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: width === 390 ? 844 : 900 });
    assert.equal(await page.$eval('.phantom-drawer', (drawer) => {
      const rect = drawer.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    }), true);
    await page.screenshot({ path: `qa-artifacts/camera-views/${width}.png` });
  }
  await page.click('[data-camera-mode="free"]');
  await page.keyboard.press('Escape');
  assert.equal(await page.$eval('.phantom-drawer', (drawer) => drawer.hidden), true);
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => window.__cameraErrors), []);
  console.log('PASS: five tracked modes, safe ranges, manual interruption, navigation handoff, free camera, desktop/mobile layout and Escape; no page or render errors');
} finally {
  await browser.close();
}
