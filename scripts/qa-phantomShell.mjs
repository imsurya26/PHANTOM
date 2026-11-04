import assert from 'node:assert/strict';

/** Interact with actual shell buttons, including mobile's smaller navigation. */
export async function clickShellButton(page, label, scope = '#phantom-shell') {
  const handle = await page.waitForFunction(
    (text, selector) =>
      [...document.querySelectorAll(`${selector} button`)].find(
        (button) =>
          button.textContent.trim() === text &&
          button.getBoundingClientRect().width > 0 &&
          !button.disabled,
      ),
    { timeout: 15_000 },
    label,
    scope,
  );
  const button = handle.asElement();
  assert.ok(button, `visible shell button: ${label}`);
  await button.click();
  await handle.dispose();
}

export async function waitForPhantom(page) {
  await page.waitForFunction(
    () =>
      window.__godsEyeView?.dataManager &&
      document.querySelector('#phantom-shell'),
    { timeout: 150_000 },
  );
  await page.waitForFunction(
    () => {
      const cover = document.getElementById('loading-screen');
      return (
        !cover ||
        getComputedStyle(cover).visibility === 'hidden' ||
        getComputedStyle(cover).display === 'none'
      );
    },
    { timeout: 90_000 },
  );
  // Escape is the supported dismissal path for the optional first-run drawer.
  await page.keyboard.press('Escape');
}

export async function openStreetSpecialist(page) {
  await clickShellButton(page, 'More');
  await clickShellButton(page, 'Street View', '.phantom-drawer');
  await clickShellButton(page, 'Open street imagery', '.phantom-drawer');
  await assertSpecialist(page, 'street-level-panel');
}

export async function openCameraSpecialist(page) {
  await clickShellButton(page, 'More');
  await clickShellButton(page, 'Cameras', '.phantom-drawer');
  await clickShellButton(page, 'Open camera controls', '.phantom-drawer');
  await assertSpecialist(page, 'cctv-panel');
}

export async function assertSpecialist(page, id) {
  await page.waitForFunction(
    (panelId) => {
      const panel = document.getElementById(panelId);
      const host = panel?.closest('.phantom-specialist');
      const rect = panel?.getBoundingClientRect();
      return host && !host.hidden && rect.width > 0 && rect.height > 0;
    },
    { timeout: 15_000 },
    id,
  );
  const result = await page.evaluate((panelId) => {
    const panel = document.getElementById(panelId);
    const host = panel.closest('.phantom-specialist');
    const rect = host.getBoundingClientRect();
    return {
      count: document.querySelectorAll('.phantom-revealed').length,
      owner: panel.parentElement.className,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: innerWidth,
      height: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  }, id);
  assert.equal(result.count, 1, 'one specialist surface is revealed');
  assert.equal(result.owner, 'phantom-specialist-body', 'shell owns placement');
  assert.ok(
    result.left >= 0 && result.right <= result.width,
    'host fits viewport width',
  );
  assert.ok(
    result.top >= 0 && result.bottom <= result.height,
    'host fits viewport height',
  );
  assert.equal(result.overflow, false, 'no horizontal page overflow');
  return result;
}
