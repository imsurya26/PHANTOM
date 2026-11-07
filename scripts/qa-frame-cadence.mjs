/** Available render opportunities, bounded by both browser cadence and app cap. */
export function expectedRenderFrames({ rafs, elapsedMs, targetFrameRate }) {
  if (
    !Number.isFinite(rafs) ||
    rafs < 0 ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs <= 0
  )
    throw new TypeError(
      'A frame sample requires a positive elapsed time and finite frame count',
    );
  return Number.isFinite(targetFrameRate) && targetFrameRate > 0
    ? Math.min(rafs, (elapsedMs * targetFrameRate) / 1000)
    : rafs;
}
