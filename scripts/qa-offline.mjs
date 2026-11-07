import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { waitForPhantom } from './qa-phantomShell.mjs';
const browser = await puppeteer.launch({
  headless: true,
  executablePath:
    process.env.PUPPETEER_EXECUTABLE_PATH || (await puppeteer.executablePath()),
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const url = process.env.QA_BASE_URL || 'http://localhost:4186';
  await page.goto(`${url}/?welcome=0`);
  await waitForPhantom(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const manifest = await page.evaluate(async () =>
    (await fetch('/manifest.webmanifest')).json(),
  );
  assert.equal(manifest.name, 'PHANTOM — Earth intelligence');
  assert.ok(manifest.icons.length >= 2);
  const protocol = await page.createCDPSession();
  const installability = await protocol.send('Page.getInstallabilityErrors');
  assert.deepEqual(
    installability.installabilityErrors,
    [],
    'Chrome installability criteria',
  );
  // A distinct script URL exercises the real worker update lifecycle without
  // modifying a deployed asset or introducing a second production worker.
  await page.evaluate(() =>
    navigator.serviceWorker.register('/phantom-sw.js?qa-upgrade=1', {
      scope: '/',
      updateViaCache: 'none',
    }),
  );
  await page.waitForSelector('.phantom-update-notice');
  assert.match(
    await page.$eval('.phantom-update-notice', (e) => e.textContent),
    /update is available/,
  );
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.$eval('.phantom-update-notice button', (button) => button.click()),
  ]);
  await waitForPhantom(page);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMediaType('print');
  assert.match(
    await page.$eval('#phantom-print-report', (e) => e.innerText),
    /Session summary only/,
  );
  assert.equal(
    await page.$eval('#phantom-shell', (e) => getComputedStyle(e).display),
    'none',
  );
  await mkdir('qa-artifacts/offline', { recursive: true });
  await page.pdf({ path: 'qa-artifacts/offline/session.pdf', format: 'A4' });
  await page.emulateMediaType('screen');
  const cached = await page.evaluate(async () => {
    const result = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys())
        result.push(new URL(request.url).pathname);
    return result;
  });
  assert.deepEqual(cached.sort(), [
    '/offline.css',
    '/offline.html',
    '/phantom.svg',
  ]);
  await page.setOfflineMode(true);
  await page.setCacheEnabled(false);
  const workerSessions = [];
  for (const target of browser
    .targets()
    .filter((target) => target.type() === 'service_worker')) {
    const session = await target.createCDPSession();
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    workerSessions.push(session);
  }
  await page.goto(`${url}/?offline-check=1`, { waitUntil: 'domcontentloaded' });
  assert.match(
    await page.$eval('body', (e) => e.innerText),
    /offline|reconnect/i,
  );
  assert.equal(await page.$('#phantom-shell'), null);
  await page.screenshot({ path: 'qa-artifacts/offline/fallback.png' });
  await page.setOfflineMode(false);
  for (const session of workerSessions)
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  await page.goto(`${url}/?welcome=0`);
  await waitForPhantom(page);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: Chrome installability criteria, update notification and explicit reload, service worker control, bounded static cache, offline navigation, reconnect and printable session summary',
  );
} finally {
  await browser.close();
}
