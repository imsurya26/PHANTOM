import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer';
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
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:4182';
async function clickText(text) {
  const buttons = await page.$$('#phantom-drawer button');
  for (const button of buttons) {
    if (
      await button.evaluate(
        (element, value) => element.textContent === value,
        text,
      )
    ) {
      await button.click();
      return;
    }
  }
  throw Error('Missing action: ' + text);
}
async function open(name, mobile = false) {
  await page.click(
    `${mobile ? '.phantom-mobile-nav ' : ''}[data-section="${name}"]`,
  );
  assert.equal(
    await page.$eval('#phantom-section-title', (e) => e.textContent),
    name,
  );
}
try {
  await page.setViewport({ width: 1440, height: 900 });
  const landingRequests = [];
  const collectLanding = (request) => landingRequests.push(request.url());
  page.on('request', collectLanding);
  await page.goto(base + '/welcome.html', { waitUntil: 'networkidle0' });
  assert.equal(
    await page.evaluate(() => Boolean(window.Cesium || window.__godsEyeView)),
    false,
  );
  assert.deepEqual(
    landingRequests.filter((url) =>
      /\/api\/|\/Cesium\/|\/cesium\/|main\.js|gemini|\.m3u8/.test(url),
    ),
    [],
  );
  await fs.mkdir('qa-shots/phantom-rework', { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: width === 390 ? 844 : 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.$eval('.product-preview', (element) =>
      element.scrollIntoView({ behavior: 'instant' }),
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.product-preview img')].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    );
    await page.evaluate(async () => {
      await Promise.all(
        [...document.querySelectorAll('.product-preview img')].map((image) =>
          image.decode(),
        ),
      );
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      scrollTo({ top: 0, behavior: 'instant' });
    });
    await page.screenshot({
      path: 'qa-shots/phantom-rework/landing-' + width + '.png',
      fullPage: true,
    });
  }
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await page.waitForFunction(() =>
    document.body.classList.contains('motion-paused'),
  );
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'no-preference' },
  ]);
  page.off('request', collectLanding);
  await page.setViewport({ width: 1440, height: 900 });
  await page.click('.rainbow-button');
  await page.waitForFunction(() => location.pathname === '/');
  console.log(
    'PASS isolated landing requests, desktop/mobile overflow, reduced motion, actual explorer CTA',
  );

  await page.waitForFunction(
    () =>
      window.__godsEyeView &&
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 90000 },
  );
  assert.equal(await page.$$eval('.phantom-nav button', (e) => e.length), 9);
  assert.equal(
    await page.$$eval('.phantom-nav button svg', (e) => e.length),
    9,
  );
  assert.equal(
    await page.evaluate(() => window.__godsEyeView.voiceCommands.loaded),
    false,
  );
  assert.equal(
    await page.evaluate(() => Boolean(window.__phantomPerformance)),
    false,
  );
  for (const name of [
    'Explore',
    'Layers',
    'Events',
    'Nexus',
    'Timeline',
    'Map',
    'More',
  ]) {
    await open(name);
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#phantom-drawer', (e) => e.hidden), true);
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.section),
      name,
    );
  }
  await open('Layers');
  assert.ok((await page.$$eval('[data-layer]', (e) => e.length)) > 8);
  await page.keyboard.press('Escape');
  await page.type('#location-search', 'Chennai');
  await page.waitForSelector('#phantom-search-results:not([hidden])');
  assert.match(
    await page.$eval('#phantom-search-results', (e) => e.textContent),
    /Place, airport or coordinates/,
  );
  await page.keyboard.press('Escape');
  await page.click('.phantom-nav [data-section="Voice"]');
  await page.waitForSelector('#phantom-drawer #gev-voice-control', {
    timeout: 30000,
  });
  assert.equal(
    await page.evaluate(() => window.__godsEyeView.voiceCommands.loaded),
    true,
  );
  assert.match(
    await page.$eval('#gev-voice-control', (e) => e.textContent),
    /Gemini Live/,
  );
  assert.equal(
    await page.evaluate(
      () => window.__godsEyeView.voiceCommands.session.active,
    ),
    false,
  );
  await page.keyboard.press('Escape');
  assert.equal(await page.$eval('#gev-voice-control', (e) => e.hidden), true);
  assert.equal(
    await page.evaluate(
      () => window.__godsEyeView.voiceCommands.session.active,
    ),
    false,
  );
  await open('Map');
  assert.equal(
    await page.$$eval('.phantom-map-select option', (options) =>
      options.some((o) => o.disabled || /unavailable/i.test(o.textContent)),
    ),
    false,
  );
  await page.keyboard.press('Escape');
  await open('Explore');
  await clickText('Take the 60-second tour');
  assert.match(
    await page.$eval('#phantom-section-title', (e) => e.textContent),
    /Tour/,
  );
  await clickText('Skip tour');
  await page.keyboard.press('Escape');
  const status = await page.evaluate(async () => {
    const r = await fetch('/api/providers/status');
    return { status: r.status, body: await r.json() };
  });
  assert.equal(status.status, 200);
  assert.ok(JSON.stringify(status.body).includes('credentialConfigured'));
  await fs.mkdir('qa-shots/phantom-rework', { recursive: true });
  await page.waitForFunction(
    () => !window.__godsEyeView.viewer.camera._currentFlight,
    { timeout: 30000 },
  );
  await page
    .waitForFunction(
      () => window.__godsEyeView.viewer.scene.globe.tilesLoaded,
      { timeout: 30000 },
    )
    .catch(() => console.log('NOTE external map tiles still loading'));
  const credit = await page.$eval(
    '#cesium-credits .cesium-widget-credits',
    (e) => {
      const r = e.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    },
  );
  assert.ok(
    credit.right > credit.left &&
      credit.bottom > credit.top &&
      credit.left >= 0 &&
      credit.right <= 1440 &&
      credit.bottom <= 856,
    JSON.stringify(credit),
  );
  await page.screenshot({ path: 'qa-shots/phantom-rework/desktop.png' });
  console.log(
    'PASS desktop navigation, keyboard, grouped layers, search, lazy voice, tour, provider status',
  );
  await page.setViewport({ width: 390, height: 844 });
  assert.equal(
    await page.$$eval('.phantom-mobile-nav button', (e) => e.length),
    5,
  );
  assert.equal(
    await page.$$eval('.phantom-mobile-nav button svg', (e) => e.length),
    5,
  );
  const nav = await page.$eval('.phantom-mobile-nav', (e) => {
    const r = e.getBoundingClientRect();
    return { left: r.left, width: r.width };
  });
  assert.ok(nav.left >= 0 && nav.left + nav.width <= 390);
  await open('More', true);
  const rect = await page.$eval('#phantom-drawer', (e) => {
    const r = e.getBoundingClientRect();
    return { left: r.left, right: r.right, bottom: r.bottom };
  });
  assert.ok(
    rect.left >= 0 && rect.right <= 390 && rect.bottom <= 844,
    JSON.stringify(rect),
  );
  await page.evaluate(() =>
    Promise.all(
      document
        .querySelector('#phantom-drawer')
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
  await page.screenshot({ path: 'qa-shots/phantom-rework/mobile.png' });
  await clickText('Voice controls');
  await page.waitForSelector('#phantom-drawer #gev-voice-control');
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(() => {
      const active = document.activeElement;
      return (
        active.dataset.section === 'More' &&
        active.getBoundingClientRect().width > 0
      );
    }),
    true,
    'Mobile voice dismissal must restore focus to the visible More dock control',
  );
  await page.keyboard.press('Escape');
  await page.setOfflineMode(true);
  await page.waitForFunction(
    () => !document.querySelector('.phantom-connectivity').hidden,
  );
  assert.match(
    await page.$eval('.phantom-connectivity', (e) => e.textContent),
    /offline/i,
  );
  await page.setOfflineMode(false);
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await open('Layers', true);
  assert.equal(
    await page.$eval(
      '#phantom-drawer',
      (e) => getComputedStyle(e).animationName,
    ),
    'none',
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS mobile layout, offline state, reduced motion, no page exceptions',
  );
} catch (error) {
  console.log(
    'DIAGNOSTICS',
    JSON.stringify({
      errors,
      state: await page
        .evaluate(() => ({
          url: location.href,
          ready: document.readyState,
          app: Boolean(window.__godsEyeView),
          loading: document.querySelector('#loading-screen')?.textContent,
          body: document.body.innerText.slice(0, 1500),
        }))
        .catch(() => null),
    }),
  );
  await page
    .screenshot({ path: 'qa-artifacts/core-browser-failure.png' })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
