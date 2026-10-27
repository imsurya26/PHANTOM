/** Restore the logical API path after Vercel's explicit function rewrite. */
export function restoreApiUrl(raw = '') {
  const url = new URL(raw, 'http://localhost');
  const routes = url.searchParams.getAll('__phantom_route');
  if (!routes.length) return raw;
  if (
    routes.length !== 1 ||
    !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*(?:\.(?:pbf|bin))?$/.test(routes[0])
  )
    return '/invalid-api-path';
  url.searchParams.delete('__phantom_route');
  // Vercel also forwards the named source capture as `path`. It is routing
  // metadata, not a provider parameter. Remove only an exact matching capture.
  if (
    url.searchParams.getAll('path').length === 1 &&
    url.searchParams.get('path') === routes[0]
  )
    url.searchParams.delete('path');
  const query = url.searchParams.toString();
  return `/api/${routes[0]}${query ? `?${query}` : ''}`;
}
