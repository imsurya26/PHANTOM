# PHANTOM API keys

Configure fresh credentials in the project root `.env.local`, which Git ignores. Restart the local server after changing configuration. Never put private keys in chat, screenshots, source files, URLs, or browser storage. Previously disclosed credentials must not be reused.

| Environment variable | Exposure | Feature |
| --- | --- | --- |
| `GEMINI_API_KEY` | Server only | Gemini Live ephemeral session provisioning |
| `GOOGLE_MAPS_API_KEY` | Public browser key | Google Photorealistic 3D tiles |
| `GOOGLE_MAPS_SERVER_API_KEY` | Server only | Optional Google Places requests |
| `CESIUM_ION_TOKEN` | Public browser token | Optional ion map services |
| `MAPILLARY_CLIENT_TOKEN` | Public browser token | Street imagery |
| `MAPILLARY_CLIENT_SECRET` | Server only; not needed for imagery browsing | Reserved owner configuration |
| `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` | Server only | Authenticated aircraft source |
| `FIRMS_MAP_KEY` | Server only | NASA fire detections |
| `OPENAQ_API_KEY` | Server only | Air quality observations |
| `AISSTREAM_API_KEY` | Server only | Vessel observations |
| `TOMTOM_API_KEY` | Server only | Traffic |

Browser keys are visible to visitors by design. Restrict the Google browser key to the intended website referrers and Map Tiles API in its provider console; restrict server credentials separately. The app does not verify account restrictions, billing, or API activation merely because a key exists. Never substitute the Google server key for the browser key.

The local server detects configured credentials automatically. Settings → Advanced shows provider state and map diagnostics. `CREDENTIAL_MISSING` is a local configuration problem. `ACCESS_DENIED` does not distinguish billing, activation, and restrictions without further provider evidence. `QUOTA_OR_RATE_LIMIT` indicates a provider rejection; repeated retries cannot fix exhausted quota. Selecting a configured Google map retries its loading; failures leave the free map available.

Gemini uses a short-lived, single-use token to connect the browser. The permanent key remains on the server. `PHANTOM_GEMINI_ENABLED=0` disables voice; `PHANTOM_DISABLED_PROVIDERS` supplies additional owner kill switches. Public voice deployment remains blocked until authenticated admission and appropriate budgets are implemented. No key is required to explore the default free map.

Credential presence is not a successful live test. Google tiles and Gemini microphone/audio need separate end-to-end verification with owner-supplied, rotated local credentials. Private credential values are never included in status responses.
