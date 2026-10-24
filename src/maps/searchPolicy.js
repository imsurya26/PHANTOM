/** Keep non-Google place-search results on the free map; camera/layers survive. */
export function useFreeMapForSearch(search, controller) {
  return {
    ...search,
    async geocode(...args) {
      if (controller.getActiveId() === 'photoreal') {
        await controller.setStack('osm');
        if (controller.getActiveId() === 'photoreal') {
          return { place: null, answered: false };
        }
      }
      return search.geocode(...args);
    },
  };
}
