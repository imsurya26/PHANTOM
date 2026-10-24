/** Search bounded, already-loaded records; never starts a hidden layer or network poll. */
export function searchLoadedRecords(dataManager, query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (q.length < 2) return [];
  const matches = [];
  for (const [layerId, entry] of dataManager.layers) {
    if (!entry.enabled) continue;
    const layer = entry.module;
    const type = /flight|military/.test(layerId)
      ? 'Aircraft'
      : /vessel/.test(layerId)
        ? 'Ship'
        : /earthquake|firms/.test(layerId)
          ? 'Event'
          : 'Infrastructure';
    const records =
      layer.getAllPositions?.(300) || layer.getAnalystRecords?.(300) || [];
    for (const r of records) {
      const label = String(
        r.label ||
          r.name ||
          r.callsign ||
          r.place ||
          r.properties?.name ||
          r.id ||
          '',
      );
      if (
        ![label, r.id, r.registration].some((v) =>
          String(v || '')
            .toLowerCase()
            .includes(q),
        )
      )
        continue;
      const lat = r.latitude ?? r.lat,
        lon = r.longitude ?? r.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      matches.push({ label, type, lat, lon, layerId });
      if (matches.length === 8) return matches;
    }
  }
  return matches;
}

export function mountUniversalSearch({ dataManager, styleManager }) {
  const input = document.getElementById('location-search');
  if (!input) return () => {};
  const lifetime = new AbortController(),
    { signal } = lifetime;
  const list = document.createElement('div');
  list.id = 'phantom-search-results';
  list.className = 'phantom-search-results';
  list.setAttribute('aria-label', 'Search suggestions');
  list.hidden = true;
  input.parentElement.append(list);
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');
  let timer;
  const hide = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  };
  function render() {
    list.replaceChildren();
    const query = input.value.trim();
    if (query.length < 2) return hide();
    const rows = searchLoadedRecords(dataManager, query);
    const add = (label, run) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener(
        'click',
        () => {
          hide();
          run();
        },
        { signal },
      );
      list.append(button);
    };
    add(
      `Place, airport or coordinates · ${query}`,
      () => void styleManager._locationLookup?.run(query),
    );
    for (const row of rows)
      add(
        `${row.type} · ${row.label}`,
        () => void styleManager._locationLookup?.run(`${row.lat}, ${row.lon}`),
      );
    const note = document.createElement('small');
    note.textContent =
      'Objects are searched in loaded layers. Turn on a layer to find its reports.';
    list.append(note);
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  input.addEventListener(
    'input',
    () => {
      clearTimeout(timer);
      timer = setTimeout(render, 180);
    },
    { signal },
  );
  input.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') hide();
      if (event.key === 'ArrowDown' && !list.hidden) {
        event.preventDefault();
        list.querySelector('button')?.focus();
      }
      if (event.key === 'Enter') hide();
    },
    { signal },
  );
  list.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        hide();
        input.focus();
      }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        const buttons = [...list.querySelectorAll('button')];
        const index = buttons.indexOf(document.activeElement);
        buttons[
          (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) %
            buttons.length
        ]?.focus();
      }
    },
    { signal },
  );
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!list.contains(event.target) && event.target !== input) hide();
    },
    { signal },
  );
  return () => {
    clearTimeout(timer);
    lifetime.abort();
    list.remove();
    input.removeAttribute('aria-controls');
    input.removeAttribute('aria-expanded');
  };
}
