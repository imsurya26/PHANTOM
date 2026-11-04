const missing = 'Unavailable';
const text = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : missing;
const measured = (value, scale, unit) =>
  Number.isFinite(value) ? `${Math.round(value * scale)} ${unit}` : missing;

/** Provider records only: schedules cannot be inferred from an ADS-B position. */
export function flightDetailRows(info) {
  return [
    ['Callsign / flight number', text(info.callsign)],
    ['Aircraft type', text(info.typeName || info.typeCode)],
    ['Origin · inferred route', text(info.origin)],
    ['Destination · inferred route', text(info.destination)],
    [
      'Departure airport · inferred',
      text(info.route?.origin?.name || info.route?.origin?.code),
    ],
    [
      'Arrival airport · inferred',
      text(info.route?.destination?.name || info.route?.destination?.code),
    ],
    ['Scheduled departure', missing],
    ['Estimated / actual departure', missing],
    ['Scheduled arrival', missing],
    ['Estimated arrival', missing],
    ['Reported altitude', measured(info.altitudeM, 3.28084, 'ft')],
    [
      'Reported speed',
      info.velocityMps >= 0
        ? measured(info.velocityMps, 1.94384, 'kt')
        : missing,
    ],
    [
      'Reported heading',
      Number.isFinite(info.track) && info.track >= 0 && info.track <= 360
        ? measured(info.track, 1, '°')
        : missing,
    ],
    ['Flight status', missing],
  ];
}

export function mountFlightDetails(
  container,
  { dataManager, layerId, signal },
) {
  const heading = document.createElement('h3');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const list = document.createElement('dl');
  list.className = 'phantom-flight-details';
  container.append(heading, status, list);
  let previous;
  const update = () => {
    if (signal.aborted || document.hidden) return;
    const info = dataManager.layers
      .get(layerId)
      ?.module.getTrackedFlightDetails?.();
    const cached = Boolean(
      info?.stale ||
      (Number.isFinite(info?.observedAt) &&
        Date.now() - info.observedAt > 120000),
    );
    const signature = JSON.stringify([info, cached]);
    if (signature === previous) return;
    previous = signature;
    heading.textContent = info
      ? text(info.callsign || info.registration || info.icao24)
      : 'Select an aircraft on the globe';
    list.replaceChildren();
    if (!info) {
      status.textContent =
        'Flight details are unavailable until an aircraft is selected.';
      return;
    }
    const date = Number.isFinite(info.observedAt)
      ? new Date(info.observedAt)
      : null;
    const dated = date && Number.isFinite(date.getTime());
    const freshness = cached
      ? 'Cached observation'
      : 'Latest provider observation';
    status.textContent = `${freshness} · ${dated ? date.toLocaleString() : 'Observation time unavailable'}. Route enrichment is inferred; schedules and operational status are unavailable.`;
    for (const [label, value] of flightDetailRows(info)) {
      const term = document.createElement('dt');
      term.textContent = label;
      const definition = document.createElement('dd');
      definition.textContent = value;
      list.append(term, definition);
    }
  };
  update();
  const timer = setInterval(update, 1000);
  const stop = () => clearInterval(timer);
  signal.addEventListener('abort', stop, { once: true });
  return stop;
}
