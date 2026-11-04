import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { clickShellButton, waitForPhantom } from './qa-phantomShell.mjs';

/** The native shell exposes a select; floating legacy chips remain a separate contract. */
export async function runPhantomMapChecks(page, output) {
  await waitForPhantom(page);
  await mkdir(output, { recursive: true });
  const errors = [];
  const onError = (error) => errors.push(error.message);
  page.on('pageerror', onError);
  try {
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: width === 390 ? 844 : 900 });
      await clickShellButton(page, 'More');
      await clickShellButton(page, 'Map', '.phantom-drawer');
      const options = await page.$eval('.phantom-map-select', (select) => ({
        name: select.getAttribute('aria-label'),
        values: [...select.options].map((option) => option.value),
      }));
      assert.equal(options.name, 'Map style');
      assert.ok(options.values.includes('osm'));
      assert.ok(options.values.includes('esri-imagery'));
      const before = await page.evaluate(() => {
        const { viewer, dataManager } = window.__godsEyeView;
        return {
          camera: { ...viewer.camera.positionWC },
          layers: dataManager.getAll().filter((row) => row.enabled).map((row) => row.id).sort(),
        };
      });
      for (const id of ['osm', 'esri-imagery']) {
        await page.select('.phantom-map-select', id);
        await page.waitForFunction((id) => {
          const control = document.querySelector('.phantom-map-select');
          return !control.disabled && control.value === id && window.__godsEyeView.styleManager.mapStackController.getState().activeId === id;
        }, {}, id);
      }
      const after = await page.evaluate(() => {
        const { viewer, dataManager } = window.__godsEyeView;
        return {
          camera: { ...viewer.camera.positionWC },
          layers: dataManager.getAll().filter((row) => row.enabled).map((row) => row.id).sort(),
        };
      });
      assert.deepEqual(after.layers, before.layers);
      for (const coordinate of ['x', 'y', 'z']) assert.ok(Math.abs(after.camera[coordinate] - before.camera[coordinate]) < 1, 'switching basemaps preserves camera');
      await page.focus('.phantom-map-select');
      await page.keyboard.press('Home');
      await page.keyboard.press('Enter');
      assert.equal(await page.$eval('.phantom-map-select', (select) => select === document.activeElement), true);
      const fits = await page.$eval('.phantom-map-select', (select) => {
        const box = select.getBoundingClientRect();
        return box.width > 0 && box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
      });
      assert.equal(fits, true);
      await page.screenshot({ path: path.join(output, `map-${width}.png`) });
      // Escape belongs to the native select while its popup is open.
      await page.focus('.phantom-close');
      await page.keyboard.press('Escape');
      assert.equal(await page.$eval('.phantom-drawer', (drawer) => drawer.hidden), true);
    }
    await clickShellButton(page, 'More');
    await clickShellButton(page, 'Map', '.phantom-drawer');
    await page.evaluate(() => {
      const maps = window.__godsEyeView.styleManager.mapStackController;
      window.__qaOriginalSetStack = maps.setStack;
      maps.setStack = async () => { throw new Error('QA isolated provider failure'); };
    });
    await page.select('.phantom-map-select', 'osm');
    await page.waitForFunction(() => !document.querySelector('.phantom-connectivity').hidden && !document.querySelector('.phantom-map-select').disabled);
    assert.match(await page.$eval('.phantom-connectivity', (node) => node.textContent), /could not load/);
    await page.evaluate(() => {
      window.__godsEyeView.styleManager.mapStackController.setStack = window.__qaOriginalSetStack;
      delete window.__qaOriginalSetStack;
    });
    await page.select('.phantom-map-select', 'esri-imagery');
    await page.waitForFunction(() => document.querySelector('.phantom-connectivity').hidden && !document.querySelector('.phantom-map-select').disabled);
    assert.deepEqual(errors, []);
    console.log('PASS: PHANTOM map selection, preserved camera/layers, keyboard access, desktop/mobile bounds, Escape, provider failure and recovery');
  } finally {
    page.off('pageerror', onError);
  }
}
