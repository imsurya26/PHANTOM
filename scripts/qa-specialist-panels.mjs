import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import {
  assertSpecialist,
  clickShellButton,
  openCameraSpecialist,
  openStreetSpecialist,
  waitForPhantom,
} from './qa-phantomShell.mjs';
import {
  hookRenderErrors,
  readRenderErrors,
  saveFailureArtifacts,
  watchPage,
} from './qa-browserEvidence.mjs';

/** PHANTOM owns panel placement; floating resize handles intentionally stay hidden. */
export async function verifySpecialistPanels(page) {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewport(viewport);
    for (const [id, open] of [
      ['street-level-panel', openStreetSpecialist],
      ['cctv-panel', openCameraSpecialist],
    ]) {
      await open(page);
      assert.equal(
        await page.$eval(
          '.phantom-specialist-close',
          (el) => el === document.activeElement,
        ),
        true,
        'close control receives keyboard focus',
      );
      const toggle = `.panel-collapse-btn[data-collapse-target="${id}"]`;
      await page.click(toggle);
      await page.waitForFunction(
        (id) => document.getElementById(id).classList.contains('collapsed'),
        {},
        id,
      );
      await page.click(toggle);
      await page.waitForFunction(
        (id) => !document.getElementById(id).classList.contains('collapsed'),
        {},
        id,
      );
      await assertSpecialist(page, id);
      await mkdir('qa-artifacts/specialists', { recursive: true });
      await page.screenshot({
        path: `qa-artifacts/specialists/${id}-${viewport.width}.png`,
      });
      assert.equal(
        await page.$eval(`#${id}`, (el) =>
          [
            ...el.querySelectorAll('.panel-resize-edge, .panel-resize-grip'),
          ].every((handle) => handle.getBoundingClientRect().width === 0),
        ),
        true,
        'obsolete resize handles are not exposed',
      );
      await page.focus('.phantom-specialist-close');
      await page.keyboard.press('Escape');
      assert.equal(
        await page.$eval('.phantom-specialist', (el) => el.hidden),
        true,
      );
      assert.equal(
        await page.$eval(`#${id}`, (el) => el.getBoundingClientRect().width),
        0,
        'closed specialist is hidden',
      );
      assert.equal(
        await page.evaluate(() => document.activeElement?.textContent.trim()),
        'More',
        'Escape returns focus to navigation',
      );
      await open(page);
      await clickShellButton(
        page,
        'Close advanced controls',
        '.phantom-specialist',
      );
      assert.equal(
        await page.$eval('.phantom-specialist', (el) => el.hidden),
        true,
      );
    }
  }
  console.log(
    'PASS: specialist open, collapse, expand, close, keyboard focus and responsive placement',
  );
}

async function main() {
  const { default: puppeteer } = await import('puppeteer');
  const args = process.argv.slice(2);
  const index = args.indexOf('--url');
  const url = index < 0 ? 'http://localhost:4173' : args[index + 1];
  const browser = await puppeteer.launch({
    headless: true,
    executablePath:
      process.env.PUPPETEER_EXECUTABLE_PATH || (await puppeteer.executablePath()),
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
  });
  const monitors = [];
  try {
    const page = await browser.newPage();
    const errors = [];
    monitors.push(watchPage(page, { name: 'specialists', errors }));
    await hookRenderErrors(page);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForPhantom(page);
    await verifySpecialistPanels(page);
    assert.deepEqual(
      [...errors, ...(await readRenderErrors(page))],
      [],
      'no page or render exceptions',
    );
  } catch (error) {
    await saveFailureArtifacts({
      dir: 'qa-artifacts/specialists',
      browser,
      monitors,
      error,
    });
    throw error;
  } finally {
    await browser.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
