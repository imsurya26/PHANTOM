/** Rebind draping tools when a lazily constructed map becomes active. */
export function bindActiveTileset(controller, recentImagery) {
  const sync = () => {
    const tileset = controller.getImageryHostTileset();
    if (tileset) {
      try {
        tileset.enableCollision = true;
      } catch {
        /* Older providers. */
      }
    }
    recentImagery?.attachTileset(tileset);
  };
  sync();
  return controller.subscribe(sync);
}
