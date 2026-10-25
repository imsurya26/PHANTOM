/** Polling an empty layer does not require continuous globe rendering. */
export function syncMilitaryRenderDemand(flightState, render) {
  if (
    flightState._billboardCollection?.show &&
    flightState._billboards.size > 0
  )
    render.holdContinuousRender?.('military');
  else render.releaseContinuousRender?.('military');
}
