import { layerTrust } from './trust.js';
import './offlineSupport.css';

/** Print a readable session summary, without promising a WebGL screenshot. */
function createPrintReport(dataManager) {
  const report = document.createElement('main');
  report.id = 'phantom-print-report';
  document.body.append(report);
  const add = (tag, text, parent = report) => {
    const element = document.createElement(tag);
    element.textContent = text;
    parent.append(element);
    return element;
  };
  const prepare = () => {
    report.replaceChildren();
    add('h1', 'PHANTOM · current view');
    add('p', `Printed ${new Date().toLocaleString()}`);
    add(
      'p',
      'Session summary only. The interactive globe, images and media are not included. Retrieval times do not establish observation freshness.',
    );
    const drawer = document.querySelector('.phantom-drawer:not([hidden])');
    if (drawer) {
      add(
        'h2',
        drawer.querySelector('h2')?.textContent || 'Selected information',
      );
      for (const element of drawer.querySelectorAll(
        '.phantom-content h3, .phantom-content p, .phantom-content small, .phantom-content dt, .phantom-content dd',
      )) {
        if (!element.getClientRects().length) continue;
        const value = element.textContent.trim();
        if (value) add('p', value);
      }
    }
    add('h2', 'Enabled sources');
    const enabled =
      dataManager?.getAll?.().filter((layer) => layer.enabled) || [];
    if (!enabled.length) add('p', 'No data layers enabled.');
    for (const layer of enabled) {
      const trust = layerTrust(layer);
      const article = add('article', '');
      add('h3', trust.name, article);
      add(
        'p',
        `${trust.state} · ${trust.source} · ${trust.freshness}`,
        article,
      );
      add('p', trust.explanation, article);
    }
  };
  window.addEventListener('beforeprint', prepare);
  return () => {
    window.removeEventListener('beforeprint', prepare);
    report.remove();
  };
}

/** Production registration is optional; failure never prevents map startup. */
export function mountOfflineSupport({ dataManager }) {
  const stopPrint = createPrintReport(dataManager);
  const controller = new AbortController();
  const { signal } = controller;
  let notice;
  let reloadRequested = false;
  const serviceWorker = navigator.serviceWorker;
  const showUpdate = (registration) => {
    if (signal.aborted || !registration.waiting || notice) return;
    notice = document.createElement('aside');
    notice.className = 'phantom-update-notice';
    notice.setAttribute('role', 'status');
    const text = document.createElement('p');
    text.textContent =
      'A PHANTOM update is available. Reload when you are ready; the current view may reset.';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = 'Reload now';
    reload.addEventListener(
      'click',
      () => {
        reloadRequested = true;
        registration.waiting?.postMessage({ type: 'PHANTOM_ACTIVATE_UPDATE' });
      },
      { signal },
    );
    const later = document.createElement('button');
    later.type = 'button';
    later.textContent = 'Later';
    later.addEventListener(
      'click',
      () => {
        notice.remove();
      },
      { signal },
    );
    notice.append(text, reload, later);
    document.body.append(notice);
  };
  if (import.meta.env.PROD && window.isSecureContext && serviceWorker) {
    serviceWorker.addEventListener(
      'controllerchange',
      () => {
        if (reloadRequested && !signal.aborted) window.location.reload();
      },
      { signal },
    );
    void serviceWorker
      .register('/phantom-sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        if (signal.aborted) return;
        showUpdate(registration);
        registration.addEventListener(
          'updatefound',
          () => {
            const worker = registration.installing;
            worker?.addEventListener(
              'statechange',
              () => {
                if (worker.state === 'installed' && serviceWorker.controller)
                  showUpdate(registration);
              },
              { signal },
            );
          },
          { signal },
        );
      })
      .catch(() => {
        // Browsers may disallow service workers in private/storage-restricted
        // sessions. The connected application remains usable without one.
      });
  }
  return () => {
    controller.abort();
    notice?.remove();
    stopPrint();
  };
}
