/** Browser checks for the PHANTOM shell over the real application controllers. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
async function checkCredits(label) {
  const metric = await page.evaluate(() => {
    const credit = document
      .querySelector('#cesium-credits .cesium-widget-credits')
      .getBoundingClientRect();
    const dock = document
      .querySelector('#command-dock')
      .getBoundingClientRect();
    const nav = document.querySelector('.phantom-nav').getBoundingClientRect();
    return {
      left: credit.left,
      right: credit.right,
      bottom: credit.bottom,
      top: credit.top,
      dockTop: dock.top,
      navTop: nav.top,
      width: innerWidth,
      height: innerHeight,
    };
  });
  assert.ok(
    metric.right > metric.left &&
      metric.bottom > metric.top &&
      metric.left >= 0 &&
      metric.right <= metric.width &&
      metric.bottom <= metric.dockTop,
    label + JSON.stringify(metric),
  );
  if (metric.width <= 850)
    assert.ok(metric.bottom <= metric.navTop, label + JSON.stringify(metric));
}
try {
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(
    `${process.env.QA_BASE_URL || 'http://localhost:4173'}/?welcome=0`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForSelector('#phantom-shell', { timeout: 60000 });
  await page.waitForFunction(
    () =>
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 60000 },
  );
  await page.waitForFunction(
    () =>
      !document.querySelector('#loading-screen') ||
      getComputedStyle(document.querySelector('#loading-screen'))
        .pointerEvents === 'none',
  );
  assert.equal(
    await page.$eval('#location-search', (el) => el.getAttribute('aria-label')),
    'Search a place or coordinates',
  );
  assert.equal(
    await page.evaluate(() => window.__godsEyeView.styleManager.hud.visible),
    false,
  );
  for (const section of [
    'Explore',
    'Layers',
    'Events',
    'Infrastructure',
    'Street View',
    'Analysis',
    'Settings',
  ]) {
    await page.click(`[data-section="${section}"]`);
    assert.equal(
      await page.$eval('#phantom-section-title', (el) => el.textContent),
      section,
    );
    assert.equal(await page.$eval('#phantom-drawer', (el) => el.hidden), false);
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#phantom-drawer', (el) => el.hidden), true);
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.section),
      section,
    );
  }
  await page.click('[data-section="Explore"]');
  assert.equal(await page.$$eval('[data-enable]', (els) => els.length), 3);
  await page.evaluate(() =>
    [...document.querySelectorAll('.phantom-content button')]
      .find((el) => el.textContent === 'Browse all layers')
      .click(),
  );
  assert.equal(
    await page.$eval('#data-panel', (el) => el.classList.contains('collapsed')),
    false,
  );
  await page.evaluate(() =>
    window.__godsEyeView.styleManager.setPanelCollapsed('data-panel', true),
  );
  await fs.mkdir('qa-shots/phantom', { recursive: true });
  // Wait for the opening flight so the artifact shows the selected map view.
  await page.waitForFunction(
    () => !window.__godsEyeView.viewer.camera._currentFlight,
    { timeout: 30000 },
  );
  await page
    .waitForFunction(
      () => window.__godsEyeView.viewer.scene.globe.tilesLoaded,
      { timeout: 30000 },
    )
    .catch(() =>
      console.log(
        'NOTE: external map tiles were still loading when the screenshot was taken.',
      ),
    );
  await checkCredits('desktop');
  await page.screenshot({ path: 'qa-shots/phantom/desktop.png' });
  console.log('PASS desktop navigation and real layer controls');
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(
    `${process.env.QA_BASE_URL || 'http://localhost:4173'}/?welcome=0`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForSelector('#phantom-shell');
  await page.waitForFunction(
    () =>
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 60000 },
  );
  await checkCredits('mobile');
  await page.click('[data-section="Events"]');

  await page.waitForFunction(
    () => !document.querySelector('#phantom-drawer').hidden,
  );
  await page.screenshot({ path: 'qa-shots/phantom/mobile.png' });
  const bounds = await page.evaluate(() => {
    const r = document.querySelector('#phantom-drawer').getBoundingClientRect();
    const h = document.querySelector('.phantom-header').getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      top: r.top,
      headerBottom: h.bottom,
      width: innerWidth,
      height: innerHeight,
    };
  });
  assert.ok(
    bounds.left >= 0 &&
      bounds.right <= bounds.width &&
      bounds.top >= bounds.headerBottom &&
      bounds.bottom < bounds.height - 65,
    JSON.stringify(bounds),
  );
  await page.screenshot({ path: 'qa-shots/phantom/mobile.png' });
  await page.evaluate(() =>
    [...document.querySelectorAll('.phantom-content button')]
      .find((el) => el.textContent === 'Find air quality stations')
      .click(),
  );
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.phantom-signals [role="status"]')].some(
        (el) =>
          /OpenAQ server API key|monitoring stations|temporarily unavailable|source took too long/i.test(
            el.textContent,
          ),
      ),
    { timeout: 25000 },
  );
  console.log(
    'PASS air quality reports an explicit result or configuration status',
  );
  await page.setRequestInterception(true);
  page.on('request', (request) =>
    request.url().includes('/api/phantom/signals?')
      ? request.abort('failed')
      : request.continue(),
  );
  await page.evaluate(() =>
    document.querySelector('.phantom-signals form').requestSubmit(),
  );
  await page.waitForFunction(
    () =>
      /unavailable|Failed to fetch/i.test(
        document.querySelector('.signals-status').textContent,
      ),
    { timeout: 25000 },
  );
  await page.click('[data-section="Analysis"]');
  assert.match(
    await page.$eval('.phantom-content', (el) => el.textContent),
    /Nexus/,
  );
  await page.keyboard.press('Escape');
  await checkCredits('mobile after isolated source failure');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: desktop/mobile shell, seven sections, Escape focus return, real layers, default HUD, mobile drawer bounds; no page errors.',
  );
} finally {
  await browser.close();
}
