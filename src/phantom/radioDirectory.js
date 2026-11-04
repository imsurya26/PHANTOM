const normalize = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .trim();

/** Search only the accepted provider catalog; never synthesize stations. */
export function filterRadioDirectory(stations, filters = {}, limit = 40) {
  const terms = Object.fromEntries(
    Object.entries(filters).map(([key, value]) => [key, normalize(value)]),
  );
  const matches = [];
  let total = 0;
  for (const station of stations || []) {
    const fields = {
      station: station.name,
      country: `${station.country || ''} ${station.countryCode || ''}`,
      region: station.state,
      language: (station.languages || []).join(' '),
      genre: (station.tags || []).join(' '),
    };
    if (
      Object.entries(terms).some(
        ([key, term]) => term && !normalize(fields[key]).includes(term),
      )
    )
      continue;
    total++;
    if (matches.length < Math.max(0, Math.min(100, limit)))
      matches.push(station);
  }
  return { matches, total };
}
