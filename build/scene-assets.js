import cesium from 'vite-plugin-cesium';

/** Marketing documents must never download or initialize the operational globe. */
export function sceneAssetsPlugin() {
  const plugin = cesium();
  const transform = plugin.transformIndexHtml;
  return {
    ...plugin,
    transformIndexHtml(html, context) {
      if (context.path === '/welcome.html') return [];
      return transform.call(this, html, context);
    },
  };
}
