// The welcome document has no imports from the application or its globe runtime.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const sections = [...document.querySelectorAll('[data-motion]')];
const visible = new Set();
let frame = 0;
function update() {
  frame = 0;
  if (document.hidden || reduced.matches) return;
  for (const section of visible) {
    if (!section.classList.contains('product-preview')) continue;
    const rect = section.getBoundingClientRect();
    const shift = Math.max(
      -24,
      Math.min(24, (innerHeight / 2 - rect.top - rect.height / 2) * 0.04),
    );
    section.style.setProperty('--shift', `${shift}px`);
  }
}
function schedule() {
  if (!frame && !document.hidden && !reduced.matches && visible.size)
    frame = requestAnimationFrame(update);
}
const observer = new IntersectionObserver((entries) => {
  for (const { target, isIntersecting } of entries) {
    target.classList.toggle('in-view', isIntersecting);
    if (isIntersecting) visible.add(target);
    else visible.delete(target);
  }
  schedule();
});
sections.forEach((section) => observer.observe(section));
addEventListener('scroll', schedule, { passive: true });
function syncMotion() {
  document.body.classList.toggle(
    'motion-paused',
    document.hidden || reduced.matches,
  );
  if (document.hidden || reduced.matches) {
    cancelAnimationFrame(frame);
    frame = 0;
  } else schedule();
}
document.addEventListener('visibilitychange', syncMotion);
reduced.addEventListener('change', syncMotion);
syncMotion();
for (const card of document.querySelectorAll('.magic-card')) {
  card.addEventListener(
    'pointermove',
    (event) => {
      if (reduced.matches || event.pointerType !== 'mouse') return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--x', `${event.clientX - rect.left}px`);
      card.style.setProperty('--y', `${event.clientY - rect.top}px`);
    },
    { passive: true },
  );
}
