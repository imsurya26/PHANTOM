const labels = [
  ['free', 'Free camera'],
  ['follow', 'Follow'],
  ['chase', 'Chase'],
  ['orbit', 'Orbit'],
  ['top-down', 'Top-down'],
  ['cinematic', 'Cinematic'],
  ['cockpit', 'Aircraft cockpit'],
  ['first-person', 'Ship first-person · simulated'],
];

export function mountCameraPanel(container, { cameraModes, signal }) {
  const description = document.createElement('p');
  description.textContent =
    'Select an aircraft or satellite to follow. Chase uses reported aircraft heading. Cinematic slowly orbits the selection. Dragging the globe stops automatic camera motion.';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  container.append(description, status);
  const limitation = document.createElement('small');
  limitation.textContent =
    'Ship view uses the plotted AIS position and reported heading or course. Camera height is simulated at least 8 m above the plotted position and loaded terrain; no cockpit geometry or live onboard video is implied.';
  container.append(limitation);
  const buttons = new Map();
  let error = '';
  let previous = '';
  for (const [mode, label] of labels) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'phantom-action';
    button.textContent = label;
    button.dataset.cameraMode = mode;
    button.addEventListener(
      'click',
      () => {
        const result = cameraModes.select(mode);
        error = result.ok
          ? ''
          : result.error || 'This view is currently unavailable.';
        sync();
      },
      { signal },
    );
    buttons.set(mode, button);
    container.append(button);
  }
  function sync() {
    if (signal.aborted || document.hidden) return;
    const state = cameraModes.state();
    const signature = JSON.stringify([state, error]);
    if (signature === previous) return;
    previous = signature;
    status.textContent =
      error ||
      `Current view: ${labels.find(([mode]) => mode === state.mode)?.[1] || 'Free camera'}${state.cached ? ' · cached position' : ''}`;
    for (const [mode, button] of buttons) {
      button.setAttribute('aria-pressed', String(mode === state.mode));
      button.disabled =
        mode === 'first-person'
          ? !state.firstPersonAvailable
          : !['free', 'cockpit'].includes(mode) &&
            (!state.tracked || (mode === 'chase' && !state.headingAvailable));
    }
  }
  sync();
  const timer = setInterval(sync, 500);
  signal.addEventListener('abort', () => clearInterval(timer), { once: true });
}
