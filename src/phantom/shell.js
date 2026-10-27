import { layerTrust } from './trust.js';
import { createSpecialistPanelHost } from './specialistPanel.js';
import { enableLayerWithFeedback, layerActionMessage } from './layerAction.js';
import { createDataReloader } from './dataReload.js';

const sections = [
  'Explore',
  'Layers',
  'Search',
  'Events',
  'Nexus',
  'Timeline',
  'Voice',
  'Map',
  'More',
];
const navIcons = {
  Explore: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6Z"/>',
  Layers: '<path d="m12 3 10 6-10 6L2 9Zm-9 11 9 5 9-5M3 18l9 5 9-5"/>',
  Search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  Events:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  Nexus:
    '<circle cx="12" cy="12" r="3"/><circle cx="4" cy="4" r="2"/><circle cx="20" cy="4" r="2"/><circle cx="4" cy="20" r="2"/><circle cx="20" cy="20" r="2"/><path d="m6 6 4 4m4 4 4 4m0-12-4 4m-4 4-4 4"/>',
  Timeline: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',
  Voice:
    '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M6 11a6 6 0 0 0 12 0m-6 6v5m-4 0h8"/>',
  Map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16"/>',
  More: '<circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/>',
};
const mapNames = {
  osm: 'Standard',
  'esri-imagery': 'Satellite',
  photoreal: 'Google 3D',
  'bing-aerial': 'Aerial',
  'bing-labels': 'Aerial with labels',
};
const navButton = (name) =>
  `<button type="button" data-section="${name}" aria-controls="phantom-drawer" aria-expanded="false"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${navIcons[name]}</svg><span>${name}</span></button>`;

/** Thin product shell: existing controllers remain the sole state authority. */
export function mountPhantomShell({ styleManager, dataManager, viewer }) {
  const openedWithSharedState = Boolean(
    styleManager.hasShareState || location.hash,
  );
  const controller = new AbortController();
  const { signal } = controller;
  const reloader = createDataReloader(dataManager);
  let reloadRunning = false;
  let reloadMessage = '';
  const root = document.createElement('div');
  root.id = 'phantom-shell';
  root.innerHTML = `<header class="phantom-header">
    <a class="phantom-brand" href="#" aria-label="PHANTOM home"><img src="/phantom.svg" alt="" width="28" height="28">PHANTOM</a>
    <div class="phantom-search" role="search"></div>
    <button type="button" class="phantom-status" aria-controls="phantom-drawer" title="View source freshness">LIVE</button>
    <button type="button" data-section="Settings" aria-controls="phantom-drawer" aria-expanded="false">Settings</button>
  </header>
  <nav class="phantom-nav" aria-label="Main navigation">${sections.map(navButton).join('')}</nav>
  <nav class="phantom-mobile-nav" aria-label="Mobile navigation">${['Explore', 'Layers', 'Events', 'Nexus', 'More'].map(navButton).join('')}</nav>
  <section id="phantom-drawer" class="phantom-drawer" aria-labelledby="phantom-section-title" hidden>
    <header><h2 id="phantom-section-title"></h2><button type="button" class="phantom-close" aria-label="Close panel">×</button></header>
    <div class="phantom-content"></div>
  </section>
  <div class="phantom-connectivity" role="status" hidden></div>
  <footer class="phantom-footer"><span>Latest available observations · coverage varies</span><span class="phantom-feed-count" role="status"></span></footer>`;
  document.body.append(root);
  document.body.classList.add('phantom');
  // Saved legacy panel positions must not leak into the product workspace.
  document.body.classList.remove('phantom-advanced');
  const specialist = createSpecialistPanelHost({
    document,
    root,
    setCollapsed: (...args) => styleManager.setPanelCollapsed(...args),
  });
  const drawer = root.querySelector('.phantom-drawer');
  const content = root.querySelector('.phantom-content');
  const title = root.querySelector('h2');
  const search = document.querySelector('.location-search-wrap');
  const originalSearchParent = search?.parentElement;
  const originalSearchNext = search?.nextSibling;
  if (search) root.querySelector('.phantom-search').append(search);
  const input = document.getElementById('location-search');
  if (input) {
    input.placeholder = 'Search Earth';
    input.setAttribute('aria-label', 'Search Earth: places or coordinates');
    input.maxLength = 180;
  }
  const maps = styleManager.mapStackController;
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Map style');
  select.className = 'phantom-map-select';
  let mapSelectionError = false;
  const syncMap = () => {
    select.replaceChildren();
    for (const stack of maps?.getStacks() || []) {
      if (!stack.available) continue;
      const option = document.createElement('option');
      option.value = stack.id;
      option.textContent =
        mapNames[stack.id] || stack.label || stack.name || stack.id;
      select.append(option);
    }
    select.value = maps?.getState().activeId || '';
    updateConnectivity();
  };
  syncMap();
  const stopMap = maps?.subscribe(syncMap);
  select.addEventListener(
    'change',
    async () => {
      select.disabled = true;
      mapSelectionError = false;
      try {
        await maps.setStack(select.value);
      } catch {
        mapSelectionError = true;
      } finally {
        select.disabled = false;
        syncMap();
      }
    },
    { signal },
  );
  // A shared scene keeps its own visual state, including its chosen HUD.
  if (!openedWithSharedState) {
    styleManager.setHudVisible('off');
    void styleManager.applyVisualState({ scope: { enabled: false } });
  }
  let drawerLifetime;
  let active = null;
  let returnFocus = null;
  let tourStep = 0;
  const tour = [
    [
      'Search Earth',
      'Type Chennai, an airport, or latitude and longitude in the search field. Choose a result to fly there.',
    ],
    [
      'Move around',
      'Drag the globe to pan. Scroll or pinch to zoom. Shift-drag tilts the camera.',
    ],
    [
      'Choose a layer',
      'Open Layers and turn on Aircraft. Turn off layers you do not need to keep the map clear.',
    ],
    [
      'Inspect an object',
      'Select an aircraft, ship or event on the map. Its details show the source and available tracking actions.',
    ],
    [
      'Explore events',
      'Open Events for earthquakes, fire detections and nearby context. Coverage varies by source.',
    ],
    [
      'Compare and change maps',
      'Nexus compares nearby events. Open Map in the dock to change the basemap.',
    ],
    [
      'Understand time',
      'LIVE uses the latest available observations. Source timestamps can be older. Timeline explains the available history controls.',
    ],
  ];
  function rememberWelcome() {
    try {
      localStorage.setItem('phantom:welcome:v1', 'done');
    } catch {
      /* Storage is optional. */
    }
  }
  function renderTour() {
    const targets = [
      '.phantom-search',
      '#cesiumContainer',
      '[data-section="Layers"]',
      '#cesiumContainer',
      '[data-section="Events"]',
      '[data-section="Map"], [data-section="More"]',
      '[data-section="Timeline"], [data-section="More"]',
    ];
    const target = [...document.querySelectorAll(targets[tourStep])].find(
      (el) => el.getBoundingClientRect().width > 0,
    );
    target?.classList.add('phantom-tour-target');
    drawerLifetime.signal.addEventListener(
      'abort',
      () => target?.classList.remove('phantom-tour-target'),
      { once: true },
    );
    text('small', `Step ${tourStep + 1} of ${tour.length}`);
    text('h3', tour[tourStep][0]);
    text('p', tour[tourStep][1]);
    if (tourStep > 0)
      action('Back', () => {
        tourStep--;
        open('Tour', returnFocus);
      });
    action(tourStep === tour.length - 1 ? 'Finish tour' : 'Next', () => {
      if (tourStep === tour.length - 1) {
        rememberWelcome();
        close();
      } else {
        tourStep++;
        open('Tour', returnFocus);
      }
    });
    action('Skip tour', () => {
      rememberWelcome();
      close();
    });
  }
  function renderLayers() {
    const reloadAll = action('Reload enabled data', async () => {
      if (reloadRunning) return;
      reloadRunning = true;
      reloadAll.disabled = true;
      const lifetime = drawerLifetime.signal;
      try {
        const results = await reloader.reloadEnabled({
          signal,
          report: (done, total) => {
            reloadMessage = `Refreshing ${done} of ${total} layers…`;
            if (!lifetime.aborted) reloadStatus.textContent = reloadMessage;
          },
        });
        const failed = results.filter((result) => result.ok === false).length;
        reloadMessage = results.length
          ? `Reload finished: ${results.filter((result) => result.ok).length} refreshed, ${failed} need attention, ${results.filter((result) => result.skipped).length} recently refreshed. See each layer below. Provider caches and limits still apply.`
          : 'No layers enabled. Choose a layer below first.';
      } finally {
        reloadRunning = false;
        if (!lifetime.aborted) {
          reloadAll.disabled = false;
          reloadStatus.textContent = reloadMessage;
          syncLayerCards();
        }
      }
    });
    reloadAll.disabled = reloadRunning;
    const reloadStatus = text(
      'p',
      reloadRunning ? 'Reload in progress…' : reloadMessage,
    );
    reloadStatus.setAttribute('role', 'status');
    const groups = [
      [
        'Live Activity',
        /flight|aircraft|adsb|vessel|ship|satellite/,
        'Aircraft, ships and satellite observations.',
      ],
      [
        'Environment',
        /weather|earthquake|firms|fire|cyclone|air-quality/,
        'Weather and source-reported natural events.',
      ],
      [
        'Mobility',
        /traffic|transit|bike|directions/,
        'Road flow, transit vehicles and shared-bike stations.',
      ],
      [
        'Street',
        /street|cctv|camera/,
        'Captured street imagery and available cameras.',
      ],
      [
        'Signals',
        /military|conflict|awareness|news/,
        'Context that needs source verification.',
      ],
      ['Infrastructure', /.*/, 'Mapped infrastructure and reference data.'],
    ];
    const rows = dataManager
      .getAll()
      .filter((row) => row.showInTogglePanel !== false);
    const used = new Set();
    for (const [name, matcher, explanation] of groups) {
      const group = text('details', '');
      group.open = name === 'Live Activity';
      text('summary', name, group);
      text('small', explanation, group);
      for (const row of rows) {
        if (
          used.has(row.id) ||
          !matcher.test(`${row.id} ${row.name}`.toLowerCase())
        )
          continue;
        used.add(row.id);
        const card = text('article', '', group);
        card.className = 'phantom-layer-card';
        card.dataset.layerCard = row.id;
        const label = text('label', '', card);
        label.className = 'phantom-layer-row';
        const icon = text('span', row.icon || '◇', label);
        icon.className = 'phantom-layer-icon';
        icon.setAttribute('aria-hidden', 'true');
        text('strong', row.name || row.id, label);
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = row.enabled;
        checkbox.dataset.layer = row.id;
        label.append(checkbox);
        text('small', '', card).className = 'phantom-layer-status';
        text('p', '', card).className = 'phantom-layer-explanation';
        const retry = text('button', 'Reload data', card);
        retry.type = 'button';
        retry.dataset.reloadLayer = row.id;
        retry.setAttribute('aria-label', `Reload ${row.name || row.id}`);
        const retryStatus = text('small', '', card);
        retryStatus.setAttribute('role', 'status');
        retry.addEventListener(
          'click',
          async () => {
            retry.disabled = true;
            retryStatus.textContent = 'Requesting source data…';
            const result = await reloader.reload(row.id, { signal });
            retryStatus.textContent = result.message;
            syncLayerCards();
          },
          { signal: drawerLifetime.signal },
        );
        const details = text('details', '', card);
        text('summary', 'Source details', details);
        text('small', '', details).className = 'phantom-layer-source';
        checkbox.addEventListener(
          'change',
          async () => {
            checkbox.disabled = true;
            try {
              await dataManager.setEnabled(row.id, checkbox.checked, {
                origin: 'user',
              });
            } catch {
              if (!drawerLifetime.signal.aborted)
                text('p', 'This layer is temporarily unavailable.', group);
            } finally {
              checkbox.disabled = false;
              checkbox.checked = Boolean(
                dataManager.getAll().find((layer) => layer.id === row.id)
                  ?.enabled,
              );
              syncLayerCards();
            }
          },
          { signal: drawerLifetime.signal },
        );
      }
    }
    syncLayerCards();
    action('Explore street imagery', () => open('Street View', returnFocus));
  }
  function syncLayerCards() {
    const cards = new Map(
      [...content.querySelectorAll('[data-layer-card]')].map((node) => [
        node.dataset.layerCard,
        node,
      ]),
    );
    for (const row of dataManager.getAll()) {
      const card = cards.get(row.id);
      if (!card) continue;
      const trust = layerTrust(row);
      card.querySelector('.phantom-layer-status').textContent =
        `${trust.state}${trust.count == null ? '' : ` · ${trust.count.toLocaleString()} records`}`;
      card.querySelector('.phantom-layer-explanation').textContent =
        trust.explanation;
      card.querySelector('.phantom-layer-source').textContent =
        `${trust.source} · ${trust.freshness}. Fetch time is not observation time.`;
      const checkbox = card.querySelector('input');
      checkbox.checked = Boolean(row.enabled);
      const retry = card.querySelector('[data-reload-layer]');
      if (retry)
        retry.disabled =
          !row.enabled || Boolean(row.stats?.loading || row.stats?.refreshing);
    }
  }
  async function openVoice(trigger = document.activeElement) {
    open('Voice', trigger);
    content.replaceChildren();
    text(
      'p',
      'Voice starts only when you choose to connect. Your microphone may send audio to the configured provider.',
    );
    const lifetime = drawerLifetime.signal;
    try {
      await window.__godsEyeView?.voiceCommands?.open();
      if (lifetime.aborted) return;
      const controls = document.getElementById('gev-voice-control');
      if (controls) {
        const parent = controls.parentNode;
        controls.hidden = false;
        content.append(controls);
        lifetime.addEventListener(
          'abort',
          () => {
            window.__godsEyeView?.voiceCommands?.stop();
            controls.hidden = true;
            parent?.append(controls);
          },
          {
            once: true,
          },
        );
        document.getElementById('gev-voice-button')?.focus();
      } else
        text(
          'p',
          'Voice is unavailable in this installation. Search and map controls still work.',
        );
    } catch {
      if (!lifetime.aborted)
        text('p', 'Voice could not load. Search and map controls still work.');
    }
  }
  function text(tag, value, parent = content) {
    const el = document.createElement(tag);
    el.textContent = value;
    parent.append(el);
    return el;
  }
  function action(label, handler) {
    const button = text('button', label);
    button.type = 'button';
    button.addEventListener('click', handler, {
      signal: drawerLifetime?.signal || signal,
    });
    return button;
  }
  async function enable(id) {
    const button = content.querySelector(`[data-enable="${id}"]`);
    const status = content.querySelector(`[data-enable-status="${id}"]`);
    const lifetime = drawerLifetime.signal;
    if (button) button.disabled = true;
    try {
      await enableLayerWithFeedback({
        dataManager,
        id,
        signal: lifetime,
        report: (message) => {
          if (status) status.textContent = message;
        },
      });
    } finally {
      if (button) button.disabled = false;
    }
  }
  function layerAction(label, id) {
    if (!dataManager.getAll().some((layer) => layer.id === id)) return;
    action(label, () => enable(id)).dataset.enable = id;
    const status = text('p', '');
    status.dataset.enableStatus = id;
    status.setAttribute('role', 'status');
  }
  async function lazyPanel(path, exportName, options) {
    const lifetime = drawerLifetime.signal;
    const target = document.createElement('div');
    content.append(target);
    try {
      const loaders = {
        signals: () => import('./signalsPanel.js'),
        airQuality: () => import('./airQualityPanel.js'),
        nexus: () => import('./nexusPanel.js'),
      };
      const module = await loaders[path]();
      if (!lifetime.aborted)
        module[exportName](target, { ...options, signal: lifetime });
    } catch {
      if (!lifetime.aborted)
        text(
          'p',
          'This tool could not load. Close this panel and try again.',
          target,
        );
    }
  }
  function close(focus = true) {
    specialist.close();
    drawerLifetime?.abort();
    active = null;
    drawer.hidden = true;
    root
      .querySelectorAll('[data-section]')
      .forEach((button) => button.setAttribute('aria-expanded', 'false'));
    if (focus) returnFocus?.focus();
  }
  function open(section, trigger) {
    specialist.close();
    drawerLifetime?.abort();
    drawerLifetime = new AbortController();
    active = section;
    returnFocus = trigger || document.activeElement;
    drawer.hidden = false;
    title.textContent = section;
    content.replaceChildren();
    root
      .querySelectorAll('[data-section]')
      .forEach((button) =>
        button.setAttribute(
          'aria-expanded',
          String(button.dataset.section === section),
        ),
      );
    if (section === 'Explore') {
      text('p', 'Explore what’s happening.');
      text(
        'p',
        'Search a place, move the globe, or start with a public data layer. Select a map object to inspect it.',
      );
      layerAction('Show aircraft', 'flights');
      layerAction('Show fires', 'local-firms');
      layerAction('Show weather', 'weather-radar');
      action('Explore events', () => open('Events', returnFocus));
      action('Search a location', () => {
        close(false);
        input?.focus();
      });
      action('Take the 60-second tour', () => open('Tour', returnFocus));
      action('Browse all layers', () => open('Layers', returnFocus));
      text(
        'small',
        'Coverage and update frequency vary by source. Missing data does not mean nothing is happening.',
      );
    } else if (section === 'Layers') {
      text(
        'p',
        'Choose what appears on the map. Existing layer controls include source and availability information.',
      );
      renderLayers();
      action('Advanced layer controls', () => revealPanel('data-panel'));
    } else if (section === 'Events') {
      text(
        'p',
        'Explore source-reported environmental signals. Select an event on the globe for details.',
      );
      layerAction('Show earthquakes · USGS', 'earthquakes');
      layerAction('Show active fires · NASA FIRMS', 'local-firms');
      text(
        'small',
        'Fire coverage may be unavailable in this installation. Detections are not incident verification.',
      );
      const signalOptions = {
        signal: drawerLifetime.signal,
        getCenter: () => {
          const position = (viewer || styleManager.viewer)?.camera
            ?.positionCartographic;
          return position
            ? {
                lat: (position.latitude * 180) / Math.PI,
                lon: (position.longitude * 180) / Math.PI,
              }
            : null;
        },
      };
      lazyPanel('signals', 'mountSignalsPanel', signalOptions);
      lazyPanel('airQuality', 'mountAirQualityPanel', signalOptions);
    } else if (section === 'Infrastructure') {
      text(
        'p',
        'Reference datasets show mapped infrastructure, not current operational status.',
      );
      layerAction('Show data centers', 'local-datacenters');
      layerAction('Show dams', 'local-dams');
      action('All infrastructure layers', () => revealPanel('data-panel'));
    } else if (section === 'Street View') {
      text(
        'p',
        'Explore captured street-level imagery where coverage is available. Capture dates describe when images were taken; imagery is not live.',
      );
      action('Open street imagery', () => revealPanel('street-level-panel'));
      text(
        'small',
        'Street imagery may be unavailable in this area. You can always continue exploring the map.',
      );
    } else if (section === 'Analysis' || section === 'Nexus') {
      text(
        'p',
        'Inspect objects, draw on the globe, or explore existing contextual tools.',
      );
      action('Open context and tracking', () =>
        revealPanel('global-context-panel'),
      );
      action('Open drawing and display tools', () => revealPanel('pp-toggles'));
      lazyPanel('nexus', 'mountNexusPanel', { dataManager });
    } else if (section === 'Map') {
      text(
        'p',
        'Choose how Earth appears. Data layers and your camera position are preserved.',
      );
      text('label', 'Map style').append(select);
      syncMap();
      const google = maps
        ?.getStacks()
        .find((stack) => stack.id === 'photoreal');
      if (google && !google.available)
        text(
          'small',
          'Google 3D is not configured for this installation. Standard and Satellite remain available.',
        );
      action('Street imagery', () => open('Street View', returnFocus));
      text(
        'small',
        'Street imagery contains captured photographs, not a live street feed.',
      );
      action('Advanced map diagnostics', () => open('Settings', returnFocus));
    } else if (section === 'Settings') {
      text('h3', 'Appearance');
      action('Switch light / dark interface', () => {
        document.body.classList.toggle('phantom-light');
        try {
          localStorage.setItem(
            'phantom:theme',
            document.body.classList.contains('phantom-light')
              ? 'light'
              : 'dark',
          );
        } catch {
          /* Session theme still works. */
        }
      });
      action('Map and visual settings', () => revealPanel('control-panel'));
      action('Advanced display tools', () => revealPanel('pp-toggles'));
      action('Reset display', () => {
        styleManager.setHudVisible('off');
        void styleManager.applyVisualState({
          style: 'normal',
          scope: { enabled: false },
          bloom: { enabled: false },
          sharpen: { enabled: false },
        });
      });
      action('Show / hide instrument overlay', () =>
        styleManager.setHudVisible(styleManager.hud.visible ? 'off' : 'on'),
      );
      action('Saved scenes', () => revealPanel('scene-panel'));
      text('h3', 'Providers and privacy');
      text(
        'p',
        'Map and data providers receive requests when you use their features. Voice may send scene context to its provider when activated.',
      );
      const advanced = text('details', '');
      text('summary', 'Advanced', advanced);
      text('h3', 'Map diagnostics', advanced);
      text(
        'small',
        'Place search uses the standard map. Configuration alone does not verify provider access.',
        advanced,
      );
      for (const stack of maps?.getStacks() || []) {
        const row = text('div', '', advanced);
        text(
          'p',
          `${stack.label || stack.name || stack.id}: ${stack.diagnostic?.code || (stack.available ? 'Ready to try' : 'Not configured')}`,
          row,
        );
        if (stack.available) {
          const retry = text('button', 'Try this map', row);
          retry.type = 'button';
          retry.addEventListener(
            'click',
            async () => {
              retry.disabled = true;
              try {
                await maps.setStack(stack.id);
                retry.textContent = 'Map selected';
              } catch {
                retry.textContent = 'Could not load — retry';
              } finally {
                retry.disabled = false;
                syncMap();
              }
            },
            { signal: drawerLifetime.signal },
          );
        }
      }
      const providerButton = text('button', 'Providers', advanced);
      providerButton.type = 'button';
      providerButton.addEventListener(
        'click',
        async () => {
          const lifetime = drawerLifetime.signal;
          const { openProviderSettings } =
            await import('./providerSettings.js');
          if (!lifetime.aborted && !(await openProviderSettings()))
            text(
              'p',
              'Provider settings are available to the owner on this computer.',
              advanced,
            );
        },
        { signal: drawerLifetime.signal },
      );
      action('Source status', () => open('Sources', returnFocus));
      action('Advanced workspace controls', () => revealPanel('control-panel'));
      text('h3', 'About PHANTOM');
      text('p', 'See what the world doesn’t show.');
      text(
        'small',
        'Built on God’s Eye View by Bilawal Sidhu and contributors (MIT). Data retains its own attribution and terms.',
      );
    } else if (section === 'More') {
      for (const name of [
        'Infrastructure',
        'Nexus',
        'Map',
        'Street View',
        'Help',
        'Settings',
      ])
        action(name, () => open(name, returnFocus));
      action('Voice controls', () => openVoice(returnFocus));
      action('Timeline', () => open('Timeline', returnFocus));
      const landing = text('a', 'About PHANTOM');
      landing.href = '/welcome.html';
    } else if (section === 'Help') {
      text('p', 'What can I do? Pick an action to try it.');
      action('Find Chennai', () => {
        close(false);
        if (input) {
          input.value = 'Chennai';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
          void styleManager._locationLookup?.run('Chennai');
        }
      });
      layerAction('See aircraft near me', 'flights');
      layerAction('See recent earthquakes', 'earthquakes');
      layerAction('See weather radar', 'weather-radar');
      action('Explore street imagery', () => open('Street View', returnFocus));
      action('Compare nearby events with Nexus', () =>
        open('Analysis', returnFocus),
      );
      action('Take the 60-second tour', () => {
        tourStep = 0;
        open('Tour', returnFocus);
      });
      text(
        'p',
        'Drag to move the globe. Scroll or pinch to zoom. Select a map object for its source, observation time and available tracking actions.',
      );
      text(
        'p',
        'Press Ctrl+K or ⌘K to search. Tab moves between controls; Escape closes this panel. LIVE means the latest available source data, not a guarantee of instant updates.',
      );
    } else if (section === 'Tour') {
      renderTour();
    } else if (section === 'Timeline') {
      text(
        'p',
        'LIVE shows the latest source observations. There is no universal historical replay across every layer.',
      );
      text(
        'p',
        'Weather layers have their own available frame controls. Saved scenes can play a camera sequence without changing the observation dates of live sources.',
      );
      layerAction('Load satellite clouds', 'weather-satellite');
      action('Weather layer controls', () => revealPanel('weather-panel'));
      action('Saved scenes and playback', () => revealPanel('scene-panel'));
    } else renderSources();
    drawer.querySelector('.phantom-close').focus({ preventScroll: true });
  }
  function revealPanel(id) {
    const panel = document.getElementById(id);
    if (!panel) {
      text('p', 'These controls are not available in this installation.');
      return;
    }
    close(false);
    specialist.open(panel, returnFocus);
  }
  function renderSources() {
    const rows = dataManager
      .getAll()
      .filter((layer) => layer.enabled || layer.lifecycleState === 'enabling');
    text(
      'p',
      rows.length
        ? 'Enabled layers and their reported status. Fetch time is not necessarily observation time.'
        : 'No layers enabled. Choose Layers to get started.',
    );
    for (const layer of rows) {
      const trust = layerTrust(layer);
      const row = document.createElement('article');
      row.className = 'phantom-source';
      text('h3', trust.name, row);
      text('p', `${trust.state} · ${trust.source}`, row);
      text('small', trust.freshness, row);
      content.append(row);
    }
  }
  function syncStatus() {
    const rows = dataManager.getAll().filter((layer) => layer.enabled);
    const attention = rows.filter((layer) =>
      [
        'Not configured',
        'Access denied',
        'Waiting',
        'Unavailable',
        'Degraded',
      ].includes(layerTrust(layer).state),
    ).length;
    root.querySelector('.phantom-status').textContent = attention
      ? 'LIVE · limited'
      : 'LIVE';
    root.querySelector('.phantom-feed-count').textContent =
      `${rows.length} layers enabled`;
    if (active === 'Sources') {
      content.replaceChildren();
      renderSources();
    }
    if (active === 'Layers') syncLayerCards();
    for (const status of content.querySelectorAll('[data-enable-status]')) {
      if (!status.textContent) continue;
      status.textContent = layerActionMessage(
        dataManager
          .getAll()
          .find((layer) => layer.id === status.dataset.enableStatus),
      );
    }
  }
  root.querySelectorAll('[data-section]').forEach((button) =>
    button.addEventListener(
      'click',
      () => {
        if (button.dataset.section === 'Search') {
          close(false);
          input?.focus();
        } else if (active === button.dataset.section) close();
        else if (button.dataset.section === 'Voice') void openVoice(button);
        else open(button.dataset.section, button);
      },
      { signal },
    ),
  );
  function updateConnectivity() {
    const notice = root.querySelector('.phantom-connectivity');
    const slow =
      navigator.connection?.saveData ||
      /(^|-)2g$/.test(navigator.connection?.effectiveType || '');
    const mapError = mapSelectionError || maps?.getState().lastError;
    notice.hidden = navigator.onLine && !slow && !mapError;
    notice.textContent = !navigator.onLine
      ? 'You’re offline. Previously loaded map details may still be available.'
      : slow
        ? 'Slow connection. Turn off unused layers for a smoother map.'
        : 'Map imagery could not load. Choose another map style or retry in Settings → Advanced.';
  }
  window.addEventListener('online', updateConnectivity, { signal });
  window.addEventListener('offline', updateConnectivity, { signal });
  navigator.connection?.addEventListener('change', updateConnectivity, {
    signal,
  });
  updateConnectivity();
  const welcome = () => {
    if (
      new URLSearchParams(location.search).get('welcome') === '0' ||
      openedWithSharedState
    )
      return;
    try {
      if (localStorage.getItem('phantom:welcome:v1') === 'done') return;
    } catch {
      /* Storage is optional. */
    }
    open('Explore', root.querySelector('[data-section="Explore"]'));
    action('Skip introduction', () => {
      rememberWelcome();
      close();
    });
    rememberWelcome();
  };
  window.addEventListener('phantom:welcome', welcome, { signal });
  root.querySelector('.phantom-brand').addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      open('Explore', event.currentTarget);
    },
    { signal },
  );
  root
    .querySelector('.phantom-status')
    .addEventListener(
      'click',
      (event) => open('Sources', event.currentTarget),
      { signal },
    );
  root
    .querySelector('.phantom-close')
    .addEventListener('click', () => close(), { signal });
  drawer.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    },
    { signal },
  );
  try {
    document.body.classList.toggle(
      'phantom-light',
      localStorage.getItem('phantom:theme') === 'light',
    );
  } catch {
    /* Storage is optional. */
  }
  const stopData = dataManager.subscribeActivity(syncStatus);
  syncStatus();
  return () => {
    specialist.destroy();
    drawerLifetime?.abort();
    controller.abort();
    stopMap?.();
    stopData?.();
    if (search && originalSearchParent)
      originalSearchParent.insertBefore(search, originalSearchNext);
    root.remove();
    document.body.classList.remove('phantom', 'phantom-light');
  };
}
