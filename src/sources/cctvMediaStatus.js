/** Media evidence, never HTTP success or a file extension alone, determines the label. */
export function classifyCameraMedia(camera = {}) {
  const kind = String(camera.sourceKind || '').toLowerCase();
  if (['synthetic', 'fallback', 'seed'].includes(kind)) return 'Unavailable';
  if (kind.includes('streetview') || kind.includes('static'))
    return 'Historical / static';
  if (camera.sourceStatus === 'error' || camera.sourceStatus === 'unavailable')
    return 'Unavailable';
  if (camera.isVideo && camera.mediaDecoded) {
    if (
      camera.feedType === 'hls' &&
      camera.mediaMoving &&
      camera.mediaDuration === Infinity
    )
      return 'Live video · capture time unknown';
    return 'Recorded video · capture time unknown';
  }
  if (kind === 'snapshot' && camera.sourceStatus === 'ok')
    return 'Snapshot · capture time unknown';
  return 'Unknown · select Watch to check';
}
