import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { waitForPhantom, clickShellButton } from './qa-phantomShell.mjs';

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
  await page.goto(
    `${process.env.QA_BASE_URL || 'http://localhost:4186'}/?welcome=0`,
    { waitUntil: 'domcontentloaded' },
  );
  await waitForPhantom(page);
  // Explicit UI fixture, isolated to this disposable page. Never a provider fallback.
  await page.evaluate(() => {
    window.__godsEyeView.dataManager.layers.get(
      'flights',
    ).module.getTrackedFlightDetails = () => ({
      icao24: 'fixture',
      callsign: 'QA <b>fixture</b>',
      altitudeM: 0,
      velocityMps: 0,
      track: 0,
      observedAt: Date.now() - 180000,
    });
  });
  await mkdir('qa-artifacts/flight-details', { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: width === 390 ? 844 : 900 });
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent('gev:awareness-subject-selected', {
          detail: { origin: 'user', layerId: 'flights' },
        }),
      ),
    );
    await page
      .waitForSelector('.phantom-flight-details dt')
      .catch(async (error) => {
        console.log(
          await page.$eval(
            '.phantom-content',
            (element) => element.textContent,
          ),
        );
        console.log(errors);
        throw error;
      });
    const state = await page.$eval('.phantom-drawer', (drawer) => {
      const bounds = drawer.getBoundingClientRect();
      return {
        text: drawer.textContent,
        htmlInjected: Boolean(drawer.querySelector('h3 b')),
        fits:
          bounds.left >= 0 &&
          bounds.right <= innerWidth &&
          bounds.bottom <= innerHeight,
      };
    });
    assert.match(state.text, /Cached observation/);
    assert.match(state.text, /0 ft/);
    assert.match(state.text, /0 kt/);
    assert.match(state.text, /Scheduled arrivalUnavailable/);
    assert.equal(state.htmlInjected, false);
    assert.equal(state.fits, true);
    await page.screenshot({ path: `qa-artifacts/flight-details/${width}.png` });
    await clickShellButton(page, 'Return to free camera', '.phantom-drawer');
    assert.equal(
      await page.$eval('.phantom-drawer', (drawer) => drawer.hidden),
      true,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: selected flight details, unavailable schedules, stale observations, safe text, responsive layout and free-camera action',
  );
} finally {
  await browser.close();
}
