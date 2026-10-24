import { correlateSignals, validSignal } from '../correlation/nexus.js';

export function loadedNexusSignals(dataManager) {
  const signals = [];
  for (const [id, source] of [
    ['earthquakes', 'USGS'],
    ['local-firms', 'NASA FIRMS'],
  ]) {
    const entry = dataManager.layers.get(id);
    if (!entry?.enabled) continue;
    for (const row of entry.module.getAnalystRecords?.(1000) || []) {
      const signal = {
        id: `${id}:${row.id}`,
        source,
        lat: row.lat,
        lon: row.lon,
        observedAt: id === 'earthquakes' ? row.timeMs : row.acqTime,
        label:
          id === 'earthquakes'
            ? `M${row.magnitude ?? '?'} · ${row.place || row.id}`
            : `Fire detection · ${row.satellite || 'satellite'} · ${row.id}`,
      };
      if (validSignal(signal)) signals.push(signal);
    }
  }
  return signals.sort((a, b) => b.observedAt - a.observedAt);
}

export function mountNexusPanel(container, { signal, dataManager }) {
  const root = document.createElement('section');
  root.className = 'phantom-signals';
  root.innerHTML =
    '<h3>PHANTOM Nexus</h3><p>Compare loaded earthquake and fire reports within 100 km and 6 hours of an observation. This is a calculated association, not an impact assessment.</p><button type="button">Read enabled layers</button><div class="nexus-body" role="status"></div>';
  container.append(root);
  const body = root.querySelector('.nexus-body');
  const add = (tag, value, parent = body) => {
    const el = document.createElement(tag);
    el.textContent = value;
    parent.append(el);
    return el;
  };
  root.querySelector('button').addEventListener(
    'click',
    () => {
      body.replaceChildren();
      const records = loadedNexusSignals(dataManager);
      if (!records.length) {
        add(
          'p',
          'Enable Earthquakes or Fires in Layers, then read the layers again. Reports without observation times are excluded.',
        );
        return;
      }
      const label = add('label', 'Choose an observation');
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Observation to correlate');
      // Snapshot is stable while selecting. Re-read is explicit; no per-frame work.
      for (const [index, record] of records.slice(0, 100).entries()) {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = record.label;
        select.append(option);
      }
      label.append(select);
      add(
        'small',
        `Comparing ${records.length} loaded reports; selector shows the 100 newest. Coverage may be incomplete.`,
      );
      const output = document.createElement('div');
      body.append(output);
      const render = () => {
        output.replaceChildren();
        try {
          const result = correlateSignals(
            records[Number(select.value)],
            records,
          );
          add('h3', 'Fact · source report', output);
          add(
            'p',
            `${result.fact.source}: ${result.fact.label}. Observed ${new Date(result.fact.observedAt).toLocaleString()}.`,
            output,
          );
          add('h3', `${result.totalMatches} nearby reports`, output);
          for (const item of result.matches) {
            add(
              'p',
              `Inference · ${item.label} (${item.source}), ${item.distanceKm.toFixed(1)} km away, ${Math.round(item.timeDifferenceMs / 60000)} min apart.`,
              output,
            );
          }
          if (!result.matches.length)
            add(
              'p',
              'No loaded reports meet these distance and time limits. This does not establish absence of activity.',
              output,
            );
          if (result.totalMatches > result.matches.length)
            add(
              'small',
              `Showing the nearest ${result.matches.length}.`,
              output,
            );
          add('h3', 'Uncertainty', output);
          add('p', result.uncertainty, output);
        } catch {
          add(
            'p',
            'This observation has an invalid or future timestamp and cannot be compared.',
            output,
          );
        }
      };
      select.addEventListener('change', render, { signal });
      render();
    },
    { signal },
  );
}
