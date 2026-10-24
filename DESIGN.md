# PHANTOM design contract

See what the world doesn’t show.

PHANTOM connects public signals and context. It does not identify private people, claim privileged access, or turn proximity into causality.

## Color

Dark surfaces use mineral blue-gray (#172328), a darker field (#10191d), off-white text (#edf2f0), and muted green for selection (#b5d9c8). Light surfaces use warm white (#f6f8f4), dark green text (#1c302b), and a restrained green accent (#235948). Data colors belong to data categories, not decoration. Warning states must include text.

## Typography

Inter for interface labels and body text; the existing monospace face is reserved for coordinates and technical metadata. Sentence case, short labels, readable source descriptions. Uppercase PHANTOM is an identity treatment, not the default for every control.

## Layout

The globe owns the canvas. Search, source status and Settings stay at the top. A centered desktop bottom dock opens one contextual drawer. Mobile keeps Explore, Layers, Events, Nexus and More in a bottom bar with a sheet above it. Map styles live in the Map panel. Existing advanced controls remain reachable without building a second state system. Attribution must never be covered by persistent chrome.

## Components

Use native buttons, selects and inputs, explicit labels, at least 44px primary touch targets and visible keyboard focus. Escape closes the contextual sheet and returns focus. Reopening a sheet cancels its old network requests. Provider failure explains what is affected; missing keys are not represented as live data.

No gradients, glow, scanlines or decorative motion in the working shell. Existing cinematic modes remain optional tools. Respect reduced motion and optional storage; failure to persist a preference must not prevent use.

The separate welcome page can use a restrained aurora, decorative globe, animated text and CTA borders, pointer-responsive cards and screenshot parallax. These native effects do not load Cesium or live sources. Motion stops offscreen, in hidden tabs and for reduced-motion preferences. Screenshots show actual application captures, never invented operational data.

## Trust

Fetch time, observation time and capture time are different concepts. Source freshness is never proof of live observation. News mentions are not verified incidents. Nexus presents source facts, calculated proximity and uncertainty separately; it does not manufacture confidence or causal connections.
