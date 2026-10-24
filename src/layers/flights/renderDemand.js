/** Empty/error-only flight layers need polls, but have nothing to animate. */
export function syncFlightRenderDemand(flightState, render) {
  if (
    flightState._billboardCollection?.show &&
    flightState._billboards.size > 0
  )
    render.holdContinuousRender('flights');
  else render.releaseContinuousRender('flights');
}
