import { filterRadioDirectory } from './radioDirectory.js';

/** A directory view over the existing Radio owner: no second player or polling loop. */
export function mountRadioPanel(container, { dataManager, signal } = {}) {
  const layer = dataManager?.layers?.get('radio')?.module;
  const add = (tag, text, parent = container) => {
    const node = document.createElement(tag);
    node.textContent = text;
    parent.append(node);
    return node;
  };
  if (!layer?.subscribe) {
    add('p', 'Radio is not available in this installation.');
    return;
  }
  add(
    'p',
    'Search the loaded Radio Browser catalog. Station metadata is community supplied; playback availability varies.',
  );
  const filters = {};
  let timer;
  let catalog;
  let renderedCatalog;
  const inputs = add('div', '');
  for (const [key, label] of Object.entries({
    station: 'Station name',
    country: 'Country',
    region: 'Region / state',
    language: 'Language',
    genre: 'Genre / tag',
  })) {
    const field = add('label', label, inputs);
    const input = add('input', '', field);
    input.type = 'search';
    input.maxLength = 100;
    input.addEventListener(
      'input',
      () => {
        filters[key] = input.value;
        clearTimeout(timer);
        timer = setTimeout(renderResults, 150);
      },
      { signal },
    );
  }
  const status = add('p', '');
  status.setAttribute('role', 'status');
  const current = add('p', 'No station selected.');
  const playback = add('button', 'Play selected station');
  playback.type = 'button';
  playback.addEventListener(
    'click',
    () => layer.togglePlayback({ origin: 'user' }),
    { signal },
  );
  const volumeLabel = add('label', 'Volume');
  const volume = add('input', '', volumeLabel);
  volume.type = 'range';
  volume.min = '0';
  volume.max = '1';
  volume.step = '0.05';
  volume.addEventListener(
    'input',
    () => layer.setVolume(Number(volume.value)),
    { signal },
  );
  const count = add('p', '');
  count.setAttribute('role', 'status');
  const results = add('div', '');
  function renderResults() {
    if (signal?.aborted) return;
    renderedCatalog = catalog;
    results.replaceChildren();
    const { matches, total } = filterRadioDirectory(catalog?.stations, filters);
    count.textContent = total
      ? `${total} matches · showing ${matches.length}`
      : 'No matching stations in the loaded catalog. Try a broader search.';
    for (const station of matches) {
      const row = add('article', '', results);
      row.className = 'phantom-source';
      add('h3', station.name || 'Unnamed station', row);
      add(
        'p',
        [station.country, station.state, ...(station.languages || [])]
          .filter(Boolean)
          .join(' · ') || 'Location and language unavailable',
        row,
      );
      add('small', (station.tags || []).join(', ') || 'Genre unavailable', row);
      const choose = add('button', 'Select station', row);
      choose.type = 'button';
      // Delegation keeps repeated filtering from retaining detached row listeners.
      choose.dataset.radioStation = station.id;
    }
  }
  results.addEventListener(
    'click',
    (event) => {
      const button = event.target.closest('[data-radio-station]');
      if (!button || !results.contains(button)) return;
      if (
        !layer.selectStation(button.dataset.radioStation, { origin: 'user' })
      ) {
        status.textContent =
          'Enable radio and wait for the catalog before selecting a station.';
      }
    },
    { signal },
  );
  const unsubscribe = layer.subscribe((state) => {
    if (signal?.aborted) return;
    catalog = layer.getAcceptedCatalogSnapshot();
    const updated = state.updatedAt
      ? new Date(state.updatedAt).toLocaleString()
      : 'not yet retrieved';
    status.textContent = state.loading
      ? 'Loading station directory…'
      : state.error
        ? 'The directory could not update. Previously loaded stations may still be available.'
        : !state.enabled
          ? 'Enable radio to load and select stations.'
          : `Radio Browser · catalog ${state.stale ? 'cached' : 'retrieved'} ${updated}`;
    current.textContent = state.selected
      ? `${state.selected.name} · ${state.audioState || 'stopped'}${state.audioError ? ' · Playback unavailable; try another station.' : ''}`
      : 'No station selected.';
    playback.disabled = !state.enabled || !state.selected;
    playback.textContent =
      state.audioState === 'playing' ? 'Pause' : 'Play selected station';
    if (document.activeElement !== volume)
      volume.value = String(state.volume ?? 0.7);
    if (renderedCatalog !== catalog) renderResults();
  });
  signal?.addEventListener(
    'abort',
    () => {
      clearTimeout(timer);
      unsubscribe();
    },
    { once: true },
  );
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
