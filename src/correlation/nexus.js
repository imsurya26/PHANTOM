/** Spherical proximity only. No causal, damage or risk scoring. */
export function distanceKm(a, b) {
  const rad = (v) => (v * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) *
      Math.cos(rad(b.lat)) *
      Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function validSignal(record) {
  return Boolean(
    record &&
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    record.id.length <= 180 &&
    typeof record.source === 'string' &&
    record.source.length > 0 &&
    record.source.length <= 180 &&
    Number.isFinite(record.lat) &&
    Math.abs(record.lat) <= 90 &&
    Number.isFinite(record.lon) &&
    Math.abs(record.lon) <= 180 &&
    Number.isFinite(record.observedAt) &&
    record.observedAt > 0,
  );
}
/** Compare one anchor with a bounded snapshot. Timestamp means observation, never fetch. */
export function correlateSignals(
  anchor,
  candidates,
  {
    radiusKm = 100,
    windowMs = 6 * 3600_000,
    maxResults = 20,
    now = Date.now(),
  } = {},
) {
  if (!validSignal(anchor) || anchor.observedAt > now + 60_000)
    throw new TypeError(
      'Anchor needs valid location, source and observation time',
    );
  if (!Array.isArray(candidates) || candidates.length > 5000)
    throw new TypeError('At most 5000 candidate signals are supported');
  if (
    !Number.isFinite(radiusKm) ||
    radiusKm <= 0 ||
    radiusKm > 1000 ||
    !Number.isFinite(windowMs) ||
    windowMs <= 0 ||
    windowMs > 7 * 86400_000 ||
    !Number.isSafeInteger(maxResults) ||
    maxResults < 1 ||
    maxResults > 100
  )
    throw new TypeError('Invalid correlation bounds');
  const seen = new Set([`${anchor.source}:${anchor.id}`]);
  const matches = [];
  let excluded = 0;
  for (const record of candidates) {
    if (!validSignal(record) || record.observedAt > now + 60_000) {
      excluded++;
      continue;
    }
    const key = `${record.source}:${record.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const timeDifferenceMs = Math.abs(record.observedAt - anchor.observedAt);
    if (timeDifferenceMs > windowMs) continue;
    const separationKm = distanceKm(anchor, record);
    if (separationKm > radiusKm) continue;
    matches.push({
      id: record.id,
      source: record.source,
      label: String(record.label || record.id).slice(0, 240),
      observedAt: record.observedAt,
      distanceKm: separationKm,
      timeDifferenceMs,
      classification: 'Inference',
      explanation:
        'These source reports are close in space and time. This does not establish a causal connection.',
    });
  }
  matches.sort(
    (a, b) =>
      a.distanceKm - b.distanceKm ||
      a.timeDifferenceMs - b.timeDifferenceMs ||
      a.id.localeCompare(b.id),
  );
  return {
    calculatedAt: now,
    fact: {
      id: anchor.id,
      source: anchor.source,
      label: String(anchor.label || anchor.id).slice(0, 240),
      observedAt: anchor.observedAt,
      lat: anchor.lat,
      lon: anchor.lon,
    },
    matches: matches.slice(0, maxResults),
    totalMatches: matches.length,
    bounds: { radiusKm, windowMs },
    excluded,
    uncertainty:
      'Source coverage may be incomplete or delayed. Proximity cannot establish impact, cause, safety or independent corroboration. No confidence score is inferred.',
  };
}
