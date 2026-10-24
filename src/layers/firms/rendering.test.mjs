import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createRendering } from './rendering.js';

function fixture() {
  const sprites = [];
  const billboards = {
    get length() {
      return sprites.length;
    },
    get(i) {
      return sprites[i];
    },
    add(value) {
      const sprite = { ...value };
      sprites.push(sprite);
      return sprite;
    },
    remove(sprite) {
      const i = sprites.indexOf(sprite);
      if (i >= 0) sprites.splice(i, 1);
    },
  };
  const state = {
    _viewer: { scene: {} },
    _dataSource: new Cesium.CustomDataSource('test'),
    _billboards: billboards,
    _fires: [],
    _firesByFrp: [],
    _pickIndexById: new Map(),
    _cullPositions: [],
  };
  let labels = 0;
  let context = [];
  const rendering = createRendering({
    layerState: state,
    services: {
      anchors: { warmFireAnchorFloors: async () => false },
      sprites: {},
    },
    config: { overlayHost: {} },
    components: {
      cards: {
        rebuildAmbientLabels() {
          labels += 1;
        },
      },
      selection: {
        topFiresWithinBounds: () => [],
        refreshContextRegistrations(value) {
          context = value;
        },
      },
      model: {
        heatScore: (cell) => cell.intensity,
        heatColor: (normalized, alpha) =>
          new Cesium.Color(normalized, 0, 0, alpha),
        cellCullPosition: (lon, lat) => Cesium.Cartesian3.fromDegrees(lon, lat),
        cellAccent: () => 'red',
        frpPixelSize: (frp) => frp,
        firePosition: (fire) =>
          Cesium.Cartesian3.fromDegrees(fire.lon, fire.lat),
        fireCullPosition: (fire) => fire.index,
        glowSprite: () => 'sprite',
        detectionColorStop: () => 'red',
        sizeBucket: () => 1,
        applyHorizonCull: () => {},
      },
    },
  });
  return {
    state,
    rendering,
    get labels() {
      return labels;
    },
    get context() {
      return context;
    },
  };
}

const cell = (lonCell, count = 1) => ({
  latCell: 20,
  lonCell,
  count,
  intensity: count * 10,
  maxFrp: 20,
  night: 0,
});
const lod = { gridDegrees: 1, labelDistance: 100 };
const fire = (index) => ({
  index,
  lat: 20,
  lon: index,
  acqMs: 1000,
  satellite: 'N20',
  frp: 10,
});
const detectionLod = { id: 'local', maxDetections: 2500, labelDistance: 100 };

test('camera changes retain overlapping FIRMS ground geometry and property bags', () => {
  const { state, rendering } = fixture();
  rendering.renderCells([cell(1), cell(2)], lod, null);
  const old = state._dataSource.entities.getById('firms-cell:1:20:2');
  const rectangle = old.rectangle;
  const properties = old.properties;
  rendering.renderCells([cell(2, 3), cell(3)], lod, null);
  assert.equal(state._dataSource.entities.values.length, 2);
  assert.equal(
    state._dataSource.entities.getById('firms-cell:1:20:1'),
    undefined,
  );
  assert.equal(state._dataSource.entities.getById('firms-cell:1:20:2'), old);
  assert.equal(old.rectangle, rectangle);
  assert.equal(old.properties, properties);
  assert.equal(old.properties.count.getValue(), 3);
});

test('unchanged 3600-cell regional viewport creates and removes zero ground entities', () => {
  const { state, rendering } = fixture();
  const cells = Array.from({ length: 3600 }, (_, i) => ({
    ...cell(i % 60),
    latCell: Math.floor(i / 60),
  }));
  rendering.renderCells(cells, lod, null);
  const collection = state._dataSource.entities;
  let additions = 0;
  let removals = 0;
  const add = collection.add.bind(collection);
  const remove = collection.remove.bind(collection);
  collection.add = (...args) => {
    additions += 1;
    return add(...args);
  };
  collection.remove = (...args) => {
    removals += 1;
    return remove(...args);
  };
  rendering.renderCells(cells, lod, null);
  assert.equal(collection.values.length, 3600);
  assert.equal(additions, 0);
  assert.equal(removals, 0);
});

test('FIRMS detection identity survives reordering and cull anchors match retained collection order', () => {
  const { state, rendering } = fixture();
  state._firesByFrp = [fire(1), fire(2), fire(3)];
  rendering.renderDetections(detectionLod, null);
  const retained = state._billboards.get(2);
  state._firesByFrp = [fire(3), fire(2), fire(4)];
  rendering.renderDetections(detectionLod, null);
  assert.equal(state._billboards.length, 3);
  assert.equal(state._billboards.get(1), retained);
  assert.deepEqual(state._cullPositions, [2, 3, 4]);
  assert.deepEqual(
    [...state._pickIndexById.keys()],
    ['firms-3', 'firms-2', 'firms-4'],
  );
});

test('empty snapshots clear old ground cells, sprites, picking, labels and context', () => {
  const f = fixture();
  f.rendering.renderCells([cell(1)], lod, null);
  assert.equal(f.rendering.renderCurrentLod(true), true);
  assert.equal(f.state._dataSource.entities.values.length, 0);
  f.state._firesByFrp = [fire(1)];
  f.rendering.renderDetections(detectionLod, null);
  assert.equal(f.state._billboards.length, 1);
  f.rendering.renderCurrentLod(true);
  assert.equal(f.state._billboards.length, 0);
  assert.equal(f.state._pickIndexById.size, 0);
  assert.deepEqual(f.state._cullPositions, []);
  assert.deepEqual(f.state._labelCandidates, []);
  assert.equal(f.state._cellCount, 0);
  assert.deepEqual(f.context, []);
  assert.equal(f.labels, 4);
});

test('switching LOD removes previous representation without leaving cells or sprites', () => {
  const { state, rendering } = fixture();
  rendering.renderCells([cell(1)], lod, null);
  state._firesByFrp = [fire(1)];
  rendering.renderDetections(detectionLod, null);
  assert.equal(state._dataSource.entities.values.length, 0);
  assert.equal(state._billboards.length, 1);
  rendering.renderCells([cell(1)], lod, null);
  assert.equal(state._dataSource.entities.values.length, 1);
  assert.equal(state._billboards.length, 0);
});
