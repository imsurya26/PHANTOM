/** Failed or empty catalogs do not need a continuously repainting globe. */
export function syncSatelliteRenderDemand(state, render) {
  if (state._enabled && state._catalog.size > 0)
    render.holdContinuousRender?.('satellites');
  else render.releaseContinuousRender?.('satellites');
}
