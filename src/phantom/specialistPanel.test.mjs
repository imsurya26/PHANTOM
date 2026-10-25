import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpecialistPanelHost } from './specialistPanel.js';

function fixture() {
  const document = { activeElement: null };
  class Element extends EventTarget {
    children = [];
    parentElement = null;
    classes = new Set();
    classList = {
      add: (value) => this.classes.add(value),
      remove: (value) => this.classes.delete(value),
      contains: (value) => this.classes.has(value),
    };
    setAttribute() {}
    get nextSibling() {
      const siblings = this.parentElement?.children || [];
      return siblings[siblings.indexOf(this) + 1] || null;
    }
    append(...nodes) {
      for (const node of nodes) this.insertBefore(node, null);
    }
    insertBefore(node, next) {
      node.remove();
      const index = next ? this.children.indexOf(next) : this.children.length;
      this.children.splice(index, 0, node);
      node.parentElement = this;
    }
    remove() {
      if (this.parentElement) {
        const siblings = this.parentElement.children;
        siblings.splice(siblings.indexOf(this), 1);
        this.parentElement = null;
      }
    }
    focus() {
      document.activeElement = this;
    }
  }
  document.createElement = () => new Element();
  const root = new Element(),
    rail = new Element(),
    trigger = new Element();
  const first = new Element(),
    second = new Element();
  first.id = 'scene-panel';
  second.id = 'pp-toggles';
  rail.append(first, second);
  const calls = [];
  const controller = createSpecialistPanelHost({
    document,
    root,
    setCollapsed: (...args) => calls.push(args),
  });
  return { root, rail, trigger, first, second, controller, calls, document };
}

test('opening another specialist restores the previous panel and never accumulates revealed controls', () => {
  const { root, rail, first, second, controller, calls } = fixture();
  controller.open(first);
  assert.equal(first.parentElement, root.children[0].children[1]);
  controller.open(second);
  assert.equal(first.parentElement, rail);
  assert.equal(first.classList.contains('phantom-revealed'), false);
  assert.equal(second.classList.contains('phantom-revealed'), true);
  assert.deepEqual(calls[0], [
    'scene-panel',
    false,
    { persist: false, explicit: true },
  ]);
  controller.close();
  assert.deepEqual(rail.children, [first, second]);
  assert.equal(root.children[0].hidden, true);
});

test('Escape restores panel location and focus, and destroy restores original DOM', () => {
  const { root, rail, trigger, first, second, controller, document } =
    fixture();
  controller.open(first, trigger);
  const escape = new Event('keydown');
  Object.defineProperty(escape, 'key', { value: 'Escape' });
  root.children[0].dispatchEvent(escape);
  assert.equal(document.activeElement, trigger);
  assert.deepEqual(rail.children, [first, second]);
  controller.open(second, trigger);
  controller.destroy();
  assert.deepEqual(rail.children, [first, second]);
  assert.equal(second.classList.contains('phantom-revealed'), false);
  assert.equal(root.children.length, 0);
});
