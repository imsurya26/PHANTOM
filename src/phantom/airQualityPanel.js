const PARAMETER_NAMES = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  no2: 'NO₂',
  o3: 'O₃',
  so2: 'SO₂',
  co: 'CO',
};

/** Optional near-real-time measurements; never fabricate AQI or health advice. */
export function mountAirQualityPanel(
  container,
  { signal, getCenter = () => null } = {},
) {
  const root = document.createElement('section');
  root.className = 'phantom-signals';
  root.innerHTML =
    '<h3>Air quality · OpenAQ</h3><p>Find monitoring stations within 10 km of the camera location. Measurements can be delayed; observation times are shown.</p><button type="button">Find air quality stations</button><p role="status"></p><div class="air-quality-results"></div>';
  container.append(root);
  const findButton = root.querySelector('button');
  const status = root.querySelector('[role="status"]');
  const results = root.querySelector('.air-quality-results');
  let requestController;
  const add = (tag, value, parent = results) => {
    const el = document.createElement(tag);
    el.textContent = value;
    parent.append(el);
    return el;
  };
  async function read(url) {
    requestController?.abort();
    requestController = new AbortController();
    const requestSignal = AbortSignal.any([
      requestController.signal,
      AbortSignal.timeout(20000),
      ...(signal ? [signal] : []),
    ]);
    const response = await fetch(url, { signal: requestSignal });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        'Air quality is temporarily unavailable. Please try again later.',
      );
    return data;
  }
  function showError(error) {
    if (signal?.aborted || !root.isConnected) return;
    status.textContent =
      error.name === 'TimeoutError'
        ? 'The source took too long to respond. The map is still available.'
        : error.message || 'Air quality is temporarily unavailable.';
  }
  async function measurements(id) {
    status.textContent = 'Reading station measurements…';
    try {
      const data = await read(`/api/air-quality/latest?locationId=${id}`);
      if (!root.isConnected) return;
      results.replaceChildren();
      if (data.state === 'key-required') {
        status.textContent =
          'Air quality is currently unavailable. You can still explore weather, events and the map.';
        return;
      }
      status.textContent = data.results.length
        ? 'Latest reported measurements; not a live sensor stream.'
        : 'No recent measurements are available at this station.';
      add('h3', data.location.name || `Station ${id}`);
      add(
        'small',
        `Source: OpenAQ · ${data.location.provider || 'Provider not reported'} · ${data.location.owner || 'Owner not reported'}`,
      );
      for (const row of data.results) {
        const article = document.createElement('article');
        article.className = 'phantom-source';
        add(
          'h3',
          `${PARAMETER_NAMES[row.parameter] || row.parameter || 'Unspecified parameter'}: ${row.value} ${row.units || '(unit not reported)'}`,
          article,
        );
        add(
          'p',
          `Observed ${new Date(row.observedAt).toLocaleString()}`,
          article,
        );
        add('small', `Sensor ${row.sensorId}`, article);
        results.append(article);
      }
      for (const license of data.location.licenses || [])
        add(
          'small',
          `${license.name || 'Provider terms'}${license.attribution ? ` · ${license.attribution}` : ''}`,
        );
      add(
        'small',
        `Fetched ${new Date(data.fetchedAt).toLocaleString()}${data.cached ? ' · Cached response' : ''}`,
      );
      if (data.truncated)
        add(
          'small',
          'The provider has more results than this bounded view displays.',
        );
    } catch (error) {
      showError(error);
    }
  }
  findButton.addEventListener(
    'click',
    async () => {
      const point = getCenter();
      if (
        !point ||
        !Number.isFinite(point.lat) ||
        !Number.isFinite(point.lon)
      ) {
        status.textContent = 'Wait for the map to load, then try again.';
        return;
      }
      findButton.disabled = true;
      status.textContent = 'Looking for monitoring stations…';
      results.replaceChildren();
      try {
        const params = new URLSearchParams({
          lat: point.lat.toFixed(3),
          lon: point.lon.toFixed(3),
          radius: '10000',
        });
        const data = await read(`/api/air-quality/locations?${params}`);
        if (!root.isConnected) return;
        if (data.state === 'key-required') {
          status.textContent =
            'Air quality is currently unavailable. You can still explore weather, events and the map.';
          return;
        }
        status.textContent = data.results.length
          ? `${data.results.length} stations found. Select a station to read its measurements.`
          : 'No monitoring stations were returned for this area. Coverage is not global.';
        for (const station of data.results) {
          const button = add('button', station.name || `Station ${station.id}`);
          button.type = 'button';
          button.addEventListener('click', () => measurements(station.id), {
            signal,
          });
        }
        if (data.truncated)
          add('small', 'Only the first 50 stations are shown.');
      } catch (error) {
        showError(error);
      } finally {
        findButton.disabled = false;
      }
    },
    { signal },
  );
}
