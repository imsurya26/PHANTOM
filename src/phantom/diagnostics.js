/** Explicit developer opt-in; no timers or observers on normal visits. */
export function mountPerformanceDiagnostics({
  viewer,
  styleManager,
  dataManager,
}) {
  if (!new URLSearchParams(location.search).has('diagnostics')) return () => {};
  viewer ||= styleManager?.viewer;
  if (!viewer) return () => {};
  let rendered = 0;
  const since = performance.now();
  const remove = viewer.scene.postRender.addEventListener(() => rendered++);
  const handle = {
    snapshot() {
      const resources = performance.getEntriesByType('resource');
      return {
        elapsedSeconds: (performance.now() - since) / 1000,
        renderedFrames: rendered,
        heapBytes: performance.memory?.usedJSHeapSize ?? null,
        domNodes: document.querySelectorAll('*').length,
        requestsInTimingBuffer: resources.length,
        transferredBytesInTimingBuffer: resources.reduce(
          (sum, r) => sum + r.transferSize,
          0,
        ),
        entities: viewer.entities.values.length,
        primitiveCollections: viewer.scene.primitives.length,
        activeAnimations: document
          .getAnimations()
          .filter((a) => a.playState === 'running').length,
        layers: dataManager
          .getAll()
          .filter((l) => l.enabled)
          .map((l) => ({ id: l.id, stats: l.stats })),
      };
    },
  };
  window.__phantomPerformance = handle;
  return () => {
    remove();
    if (window.__phantomPerformance === handle)
      delete window.__phantomPerformance;
  };
}
