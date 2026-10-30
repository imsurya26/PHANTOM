const REACTIVE_SURFACES =
  '.phantom-nav, .phantom-mobile-nav, .phantom-drawer-header';

/** Pointer lighting runs only while a mouse moves over a small UI surface. */
export function mountReactiveTheme(root, { signal } = {}) {
  const view = root?.ownerDocument?.defaultView;
  if (!view?.matchMedia || signal?.aborted) return () => {};

  const finePointer = view.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = view.matchMedia('(prefers-reduced-motion: reduce)');
  let active = null;
  let pending = null;
  let frame = null;
  let disposed = false;
  const enabled = () => finePointer.matches && !reducedMotion.matches;
  const surfaceAt = (element) => {
    const surface = element?.closest?.(REACTIVE_SURFACES);
    return surface && root.contains(surface) ? surface : null;
  };

  const clear = () => {
    if (frame !== null) view.cancelAnimationFrame(frame);
    frame = null;
    pending = null;
    if (active) {
      active.removeAttribute('data-reactive-active');
      active.style.removeProperty('--pointer-x');
      active.style.removeProperty('--pointer-y');
      active = null;
    }
  };

  const paint = () => {
    frame = null;
    if (!pending || !enabled() || disposed) return;
    const { surface, x, y } = pending;
    pending = null;
    if (!root.contains(surface)) {
      clear();
      return;
    }
    const bounds = surface.getBoundingClientRect();
    surface.style.setProperty('--pointer-x', `${x - bounds.left}px`);
    surface.style.setProperty('--pointer-y', `${y - bounds.top}px`);
    surface.setAttribute('data-reactive-active', 'true');
    active = surface;
  };

  const move = (event) => {
    if (!enabled() || event.pointerType !== 'mouse') {
      clear();
      return;
    }
    const surface = surfaceAt(event.target);
    if (!surface) {
      clear();
      return;
    }
    if (
      (active && active !== surface) ||
      (pending && pending.surface !== surface)
    ) {
      clear();
    }
    pending = { surface, x: event.clientX, y: event.clientY };
    if (frame === null) frame = view.requestAnimationFrame(paint);
  };

  const leaveSurface = (event) => {
    const current = pending?.surface || active;
    if (current && surfaceAt(event.relatedTarget) !== current) clear();
  };
  const preferenceChanged = () => {
    if (!enabled()) clear();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clear();
    root.removeEventListener('pointermove', move);
    root.removeEventListener('pointerout', leaveSurface);
    root.removeEventListener('pointerleave', clear);
    finePointer.removeEventListener('change', preferenceChanged);
    reducedMotion.removeEventListener('change', preferenceChanged);
    signal?.removeEventListener('abort', dispose);
  };

  root.addEventListener('pointermove', move, { passive: true });
  root.addEventListener('pointerout', leaveSurface, { passive: true });
  root.addEventListener('pointerleave', clear, { passive: true });
  finePointer.addEventListener('change', preferenceChanged);
  reducedMotion.addEventListener('change', preferenceChanged);
  signal?.addEventListener('abort', dispose, { once: true });
  return dispose;
}
