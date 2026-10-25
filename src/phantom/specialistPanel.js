/** One specialist surface at a time; retained controls keep their own listeners. */
export function createSpecialistPanelHost({ document, root, setCollapsed }) {
  const host = document.createElement('section');
  host.className = 'phantom-specialist';
  host.setAttribute('aria-label', 'Advanced controls');
  host.hidden = true;
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'phantom-specialist-close';
  closeButton.textContent = 'Close advanced controls';
  const body = document.createElement('div');
  body.className = 'phantom-specialist-body';
  host.append(closeButton, body);
  root.append(host);
  let current = null;
  function close(restoreFocus = false) {
    if (!current) return;
    const { panel, parent, next, trigger } = current;
    current = null;
    panel.classList.remove('phantom-revealed');
    parent.insertBefore(panel, next?.parentElement === parent ? next : null);
    host.hidden = true;
    if (restoreFocus) trigger?.focus({ preventScroll: true });
  }
  function open(panel, trigger = document.activeElement) {
    close();
    if (!panel?.parentElement) return;
    current = {
      panel,
      parent: panel.parentElement,
      next: panel.nextSibling,
      trigger,
    };
    body.append(panel);
    panel.classList.add('phantom-revealed');
    setCollapsed(panel.id, false, { persist: false, explicit: true });
    host.hidden = false;
    closeButton.focus({ preventScroll: true });
  }
  const onClose = () => close(true);
  const onKey = (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    close(true);
  };
  closeButton.addEventListener('click', onClose);
  host.addEventListener('keydown', onKey);
  return {
    open,
    close,
    destroy() {
      close();
      closeButton.removeEventListener('click', onClose);
      host.removeEventListener('keydown', onKey);
      host.remove();
    },
  };
}
