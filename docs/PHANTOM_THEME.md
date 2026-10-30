# PHANTOM interface theme

The product shell and welcome page use midnight black (`#060a12`), electric blue (`#69a7ff`) and cantaloupe orange (`#ffb17a`). Blue marks links, focus and ordinary interactions; orange marks section headings and selected navigation. Source and map data keep their own semantic colors. The saved light interface uses darker blue/orange accents for contrast.

The official Magic UI MCP server (`@magicuidesign/mcp@2.0.0`) was queried with `getRegistryItem` for `magic-card`. Its cursor-following spotlight pattern is adapted to this vanilla JavaScript application, without adding React, Motion or next-themes dependencies. Reference: https://magicui.design/docs/components/magic-card

Shell lighting is limited to navigation and drawer headers. Pointer events are coalesced into one animation frame, with no idle frame loop. Touch/coarse pointers and reduced-motion preferences disable the effect. Abort and pointer departure clear scheduled work. Hover transitions use 150–160 ms; the welcome page has no continuous decorative animations.

Validation: `node --test src/phantom/reactiveTheme.test.mjs` checks event coalescing, departure, motion preferences, touch, disposal and detached surfaces. `npm run build` validates the combined application.
