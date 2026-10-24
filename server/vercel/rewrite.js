/** Restore the logical API path after Vercel's explicit function rewrite. */
export function restoreApiUrl(raw = '') {
  const url = new URL(raw, 'http://localhost');
  const routes = url.searchParams.getAll('__phantom_route');
  if (!routes.length) return raw;
  if (routes.length !== 1 || !/^[a-z-]+(?:\/[a-z-]+)*$/.test(routes[0]))
    return '/invalid-api-path';
  url.searchParams.delete('__phantom_route');
  const query = url.searchParams.toString();
  return `/api/${routes[0]}${query ? `?${query}` : ''}`;
}
