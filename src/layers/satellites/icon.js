// One shared texture atlas entry for the fleet; no individual image downloads.
export const SATELLITE_ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><g stroke="#16252b" stroke-width="2" stroke-linejoin="round" fill="white"><path d="M3 12h11v16H3zM26 12h11v16H26z"/><path d="M14 16h12v9H14zM20 8v8M16 5l4 3 4-3"/><path d="M8 12v16M31 12v16M3 20h11M26 20h11" fill="none" stroke-width="1"/></g></svg>')}`;

export function satelliteIconOptions(style, { dense = false } = {}) {
  const size = dense ? 12 : Math.max(18, style.pixelSize * 2);
  return { image: SATELLITE_ICON, width: size, height: size };
}
