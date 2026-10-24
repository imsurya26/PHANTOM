/** Deliberately keeps news query matches separate from nearby reference places. */
export function mountSignalsPanel(
  container,
  { signal, getCenter = () => null } = {},
) {
  const root = document.createElement('section');
  root.className = 'phantom-signals';
  root.innerHTML = `<h3>News &amp; place context</h3><p>Find news mentions by topic, and Wikipedia places within 10 km of the camera location.</p>
    <form><label>News topic <input name="topic" maxlength="80" placeholder="Chennai, weather, energy…" aria-label="News topic"></label><button type="submit">Check latest context</button></form>
    <p class="signals-status" role="status"></p><div class="signals-results"></div>`;
  container.append(root);
  let pending;
  const form = root.querySelector('form');
  const status = root.querySelector('.signals-status');
  const results = root.querySelector('.signals-results');
  const addText = (tag, value, parent = results) => {
    const el = document.createElement(tag);
    el.textContent = value;
    parent.append(el);
    return el;
  };
  form.addEventListener(
    'submit',
    async (event) => {
      event.preventDefault();
      const center = getCenter();
      if (
        !center ||
        !Number.isFinite(center.lat) ||
        !Number.isFinite(center.lon)
      ) {
        status.textContent =
          'Map location is not ready. Try again after the globe loads.';
        return;
      }
      pending?.abort();
      pending = new AbortController();
      const requestSignal = signal
        ? AbortSignal.any([pending.signal, signal, AbortSignal.timeout(20000)])
        : AbortSignal.any([pending.signal, AbortSignal.timeout(20000)]);
      const button = form.querySelector('button');
      button.disabled = true;
      status.textContent = 'Checking sources…';
      results.replaceChildren();
      try {
        const params = new URLSearchParams({
          lat: center.lat.toFixed(4),
          lon: center.lon.toFixed(4),
          q: form.elements.topic.value.trim(),
        });
        const response = await fetch(`/api/phantom/signals?${params}`, {
          signal: requestSignal,
        });
        if (!response.ok)
          throw new Error(
            response.status === 429
              ? 'Too many requests. Please wait before trying again.'
              : 'Context is unavailable. Try a shorter plain-language topic.',
          );
        const data = await response.json();
        if (!root.isConnected) return;
        status.textContent =
          'Source check complete. News matches are not verified events.';
        addText('h3', 'News mentions · GDELT');
        addText(
          'p',
          `Query: ${data.query}. This news search is not a distance filter.`,
        );
        renderSource(data.news, true);
        addText('h3', 'Nearby places · Wikipedia');
        addText(
          'p',
          `Reference context near ${data.location.lat}, ${data.location.lon}. Not event evidence.`,
        );
        renderSource(data.places, false);
      } catch (error) {
        if (signal?.aborted || !root.isConnected) return;
        status.textContent =
          error.name === 'TimeoutError'
            ? 'Sources took too long to respond. The map is still available.'
            : error.message || 'Context is temporarily unavailable.';
      } finally {
        button.disabled = false;
      }
    },
    { signal },
  );
  function renderSource(source, news) {
    addText(
      'p',
      source.status === 'unavailable'
        ? 'Provider unavailable. Try again later.'
        : `${source.status === 'stale' ? 'Stale cached response. ' : ''}${source.items.length} results. Fetched ${new Date(source.fetchedAt).toLocaleString()}.`,
    );
    for (const item of source.items) {
      const article = document.createElement('article');
      article.className = 'phantom-source';
      const link = addText('a', item.title, article);
      const url = new URL(item.url);
      if (url.protocol !== 'https:' || url.username || url.password) continue;
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      if (news)
        addText(
          'small',
          `${item.publisher} · Unverified mention${item.indexedAt ? ` · Indexed ${new Date(item.indexedAt).toLocaleString()}` : ' · Index time unavailable'}`,
          article,
        );
      else
        addText(
          'small',
          item.distanceM == null
            ? 'Distance unavailable'
            : `${item.distanceM.toLocaleString()} m from query point`,
          article,
        );
      results.append(article);
    }
    addText('small', source.attribution);
  }
}
