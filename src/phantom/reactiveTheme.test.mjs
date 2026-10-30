import assert from 'node:assert/strict';
import test from 'node:test';
import { mountReactiveTheme } from './reactiveTheme.js';

function fixture() {
  const fine = Object.assign(new EventTarget(), { matches: true });
  const reduced = Object.assign(new EventTarget(), { matches: false });
  const frames = new Map();
  const surfaces = new Set();
  let nextFrame = 0;
  const view = {
    matchMedia: (query) => (query.includes('reduced-motion') ? reduced : fine),
    requestAnimationFrame: (callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  const root = Object.assign(new EventTarget(), {
    ownerDocument: { defaultView: view },
    contains: (surface) => surfaces.has(surface),
  });
  function surface() {
    const properties = new Map();
    const attributes = new Map();
    const element = {
      properties,
      attributes,
      reads: 0,
      closest() {
        return this;
      },
      style: {
        setProperty: (name, value) => properties.set(name, value),
        removeProperty: (name) => properties.delete(name),
      },
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: (name) => attributes.delete(name),
      getBoundingClientRect() {
        this.reads++;
        return { left: 10, top: 20 };
      },
    };
    surfaces.add(element);
    return element;
  }
  function emit(type, target, extra = {}) {
    const event = new Event(type);
    Object.defineProperty(event, 'target', { value: target });
    Object.assign(
      event,
      { pointerType: 'mouse', clientX: 40, clientY: 60 },
      extra,
    );
    root.dispatchEvent(event);
  }
  function flush() {
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach((callback) => callback());
  }
  return { root, fine, reduced, frames, surfaces, surface, emit, flush };
}

test('mouse bursts paint only the latest position once, with no idle loop', () => {
  const f = fixture();
  const target = f.surface();
  const dispose = mountReactiveTheme(f.root);
  for (let x = 0; x < 100; x++) f.emit('pointermove', target, { clientX: x });
  assert.equal(f.frames.size, 1);
  assert.equal(target.reads, 0);
  f.flush();
  assert.equal(target.reads, 1);
  assert.equal(target.properties.get('--pointer-x'), '89px');
  assert.equal(target.properties.get('--pointer-y'), '40px');
  assert.equal(target.attributes.get('data-reactive-active'), 'true');
  assert.equal(f.frames.size, 0);
  dispose();
});

test('leaving or changing surfaces clears old lighting and queued work', () => {
  const f = fixture();
  const first = f.surface();
  const second = f.surface();
  const dispose = mountReactiveTheme(f.root);
  f.emit('pointermove', first);
  f.flush();
  f.emit('pointermove', second);
  assert.equal(first.attributes.size, 0);
  assert.equal(first.properties.size, 0);
  f.emit('pointerout', second, { relatedTarget: null });
  assert.equal(f.frames.size, 0);
  f.flush();
  assert.equal(second.reads, 0);
  dispose();
});

test('touch, reduced motion and coarse pointers never schedule lighting', () => {
  const f = fixture();
  const target = f.surface();
  const dispose = mountReactiveTheme(f.root);
  f.emit('pointermove', target, { pointerType: 'touch' });
  assert.equal(f.frames.size, 0);
  f.reduced.matches = true;
  f.emit('pointermove', target);
  assert.equal(f.frames.size, 0);
  f.reduced.matches = false;
  f.fine.matches = false;
  f.emit('pointermove', target);
  assert.equal(f.frames.size, 0);
  dispose();
});

test('changing motion preference cancels pending work and clears visible lighting', () => {
  const f = fixture();
  const target = f.surface();
  const dispose = mountReactiveTheme(f.root);
  f.emit('pointermove', target);
  f.flush();
  f.emit('pointermove', target);
  f.reduced.matches = true;
  f.reduced.dispatchEvent(new Event('change'));
  assert.equal(f.frames.size, 0);
  assert.equal(target.attributes.size, 0);
  assert.equal(target.properties.size, 0);
  dispose();
});

test('abort removes listeners and clears active and queued work', () => {
  const f = fixture();
  const target = f.surface();
  const controller = new AbortController();
  mountReactiveTheme(f.root, { signal: controller.signal });
  f.emit('pointermove', target);
  f.flush();
  f.emit('pointermove', target);
  controller.abort();
  assert.equal(f.frames.size, 0);
  assert.equal(target.attributes.size, 0);
  f.emit('pointermove', target);
  assert.equal(f.frames.size, 0);
});

test('removed surfaces cannot be lit by a pending frame', () => {
  const f = fixture();
  const target = f.surface();
  const dispose = mountReactiveTheme(f.root);
  f.emit('pointermove', target);
  f.surfaces.delete(target);
  f.flush();
  assert.equal(target.reads, 0);
  assert.equal(target.attributes.size, 0);
  dispose();
});
