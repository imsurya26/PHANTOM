# PHANTOM user guide

PHANTOM helps you explore public observations on a globe. Coverage depends on the source and region. A blank area does not mean nothing is happening there.

## Navigation

The desktop dock sits at the bottom of the map. On phones, Explore, Layers, Events, Nexus and More stay visible; More contains Map, Voice, Timeline, Help and Settings. The welcome page at `/welcome.html` explains the product without starting the globe or data feeds. The explorer remains at `/` so existing shared scenes keep working.

## Your first two minutes

1. Choose **Search a location**, or type **Chennai** in **Search Earth**. Choose a result to move there.
2. Open **Explore → Show aircraft**. Allow a little time for the source to respond.
3. Select an aircraft on the map to see its details and available tracking controls.
4. Open **Events** for earthquakes, fire detections and nearby context.
5. Open **More → Help** for more actions, or take the optional seven-step tour. You can skip it and return later.

The first introduction appears once when local storage is available. You never need to enter an API key to explore the basic map.

## Move and search

Drag to pan. Scroll or pinch to zoom. Shift-drag tilts the camera. Search accepts places, airports and coordinates, such as `13.0827, 80.2707`. Ctrl+K (Windows) or Command+K (Mac) focuses search. Suggestions can also include objects already loaded by enabled layers; they are not a worldwide live search of every aircraft or ship.

## Layers

Open **Layers** and expand a group:

- **Live Activity:** aircraft, ships and satellite observations.
- **Environment:** weather, earthquakes, fires and related environmental observations.
- **Mobility:** road flow, transit and shared-bike stations.
- **Infrastructure:** mapped reference datasets.
- **Signals:** contextual information that needs source verification.
- **Street:** captured imagery and available cameras.

Each layer card shows its reported status, record count and Source details. Not configured, Access denied, No results and Alternative source describe different situations. Fetch time is distinct from observation time. Check a layer to show it. Uncheck it when finished. Start with one or two layers for a clearer, smoother map. **Advanced layer controls** retains specialist options. Sources and their coverage can be unavailable independently; the rest of the map remains usable.

## Aircraft and ships

Enable the relevant Live Activity layer. Select a visible object to inspect the source and observation time. Use the object's available tracking or camera actions to follow it. Aircraft and ship reception varies; tracks can be delayed or incomplete. Missing ship coverage is not proof that no vessels are present.

## Fires and weather

Use **Events → Show active fires** for reported fire detections. A detection is not an independently verified incident. Weather layers offer their own products and available frame controls. Cloud imagery and radar can have different observation times. Keep source timestamps in mind when comparing them.

## Street imagery and infrastructure

Choose **Layers → Explore street imagery** (or **More → Street View** on a phone). Open the street imagery controls and explore coverage near your location. These are captured images, not a live street feed. Coverage may be unavailable.

**More → Infrastructure** opens data centers, dams and the full infrastructure controls. These are reference datasets, not current operating-status reports. On a phone, Infrastructure is in **More**.

## Nexus and context

Open **Nexus** in the dock to compare records. It compares the available event records within the displayed distance and time limits only when requested. Read the source facts separately from the suggested relationship. Nearby events are not evidence that one caused another. Missing datasets limit the comparison.

## Time and LIVE

**LIVE** means the application is using the latest available observations. It does not mean every source updates instantly. Near real-time observations may arrive seconds or minutes later; some reference datasets are much older. Retrieval time says when PHANTOM received data, not when an event occurred.

Open **Timeline** for the available history controls. Weather products have their own frames. Saved scenes can replay camera movements. There is currently no universal historical replay across every source. On a phone, Timeline is in **More**.

Confidence describes the source's or analysis's certainty, not a guarantee. Check source names, observation times, coverage and inference labels before drawing conclusions.

## Maps, voice and settings

The **Map** menu switches between available basemaps. Unavailable optional maps remain disabled. The basic map works without optional owner credentials.

Choose **Voice** to open Gemini Live controls. Opening the controls does not start the microphone. Choose **Start voice** explicitly; close the drawer or choose **Stop voice** to end the session. Sessions are limited to five minutes. Voice sends microphone audio and permitted action results to Gemini while connected. Try “Show aircraft over Chennai” or “Open Nexus”. Search and map controls work even when voice is unavailable.

Only configured map choices appear in the main map menu. Settings → Advanced contains map diagnostics and retry controls. Place search uses the standard map. A configured key does not guarantee that its provider permits access; see [owner API setup](API_KEYS.md).

For CCTV, select a camera and choose **Watch** to request media. Selecting a marker alone does not start playback. Closing the camera panel, switching cameras, hiding the page, or disabling the layer stops playback. A recorded clip or successfully fetched image is not proof of live video; use the displayed source, media type, and capture information when available.

**Settings** includes appearance and specialist tools. **Show / hide advanced workspace** reveals retained advanced controls. Optional provider configuration is under **Settings → Advanced → Providers**, for the local owner. Ordinary use does not require this step.

## Phone, keyboard and connections

On phones use **Explore**, **Layers**, **Events** and **More** along the bottom. Panels open above this navigation. The top search stays available. Close a panel with its × button; keyboard users can press Escape to return focus to its opener. Tab moves between controls. Reduced-motion preferences are respected.

An offline notice appears when the browser reports a lost connection. Previously loaded details may remain visible, but new requests need a connection. On a slow connection, turn off unused layers. If one source is temporarily unavailable, try another layer or continue exploring the map.
