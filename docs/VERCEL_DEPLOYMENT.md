# Vercel deployment through GitHub

The production source is intended for `imsurya26/PHANTOM`. Import this repository
into Vercel and use Node 24.x. `vercel.json` defines the Vite build and the `dist`
output. The deployment must use the GitHub commit, not a local artifact upload.

## Credential boundaries

Set secrets in the Vercel project's production environment variables. Never
commit `.env.local`, paste keys into issues, or put private keys in `VITE_*`
variables. `.vercelignore` excludes local credentials and development evidence.

The static build reads only `CESIUM_ION_TOKEN`, `GOOGLE_MAPS_API_KEY`, and
`MAPILLARY_CLIENT_TOKEN`. These are browser-visible credentials; restrict their
provider-side permissions and allowed production URLs before public use.
Gemini and OpenAQ use `GEMINI_API_KEY` and `OPENAQ_API_KEY` only in the Node API.
Mapillary viewing does not require publishing its client secret.

## Shared usage controls

Configure `PHANTOM_PUBLIC_ORIGIN` as the exact HTTPS production origin without a
trailing slash. Configure `PHANTOM_REDIS_REST_URL` and
`PHANTOM_REDIS_REST_TOKEN` for a dedicated Redis REST database shared by all
function instances. The Vercel Upstash integration's `KV_REST_API_URL` and
`KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`)
are also accepted. Keep eviction disabled so usage counters cannot be removed
before their expiry. Vercel supplies `VERCEL=1`. If the store or origin is missing,
the public API denies requests instead of silently using per-process counters.

The public map is open to visitors. Gemini provisioning and OpenAQ reads are
limited by both visitor IP and global budgets. These controls are request/session
caps, not a monetary billing guarantee; provider billing quotas remain separate.

## Current scope and release checks

The public API explicitly adapts Gemini token provisioning, OpenAQ, provider
status, regional live flights, worldwide military aircraft, and place search.
Aircraft reads use adsb.lol public observations with bounded response sizes,
timeouts, coalescing and caching. The initial camera opens at regional altitude
so aircraft above the city are visible. Other server endpoints return an unavailable response. Local receiver
access, credential editing, MCP and debug endpoints are never exposed. AISStream
needs a persistent collector and shared snapshots rather than a socket started
independently in each function invocation.

Before claiming a public release, verify the deployed origin, Redis admission,
Gemini microphone/audio session, OpenAQ measurements, browser attribution and
provider URL restrictions. Inspect the Vercel build and function logs without
printing credentials. Until these checks pass, this is deployment preparation.

## Verified local credential checks

On 23 October 2026, the configured OpenAQ key returned 11 stations around
Chennai, and the Gemini key issued an ephemeral token. Neither result establishes
that the Vercel environment is configured or that a complete voice session works.
