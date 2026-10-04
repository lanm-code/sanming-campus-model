import test from 'node:test';
import assert from 'node:assert/strict';
import {fitView, panView, zoomAt, pinchView, visibleView} from '../src/plan-camera.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const worldAt = (view, point, viewport) => [
  view.cx + (point[0] - viewport.width / 2) / view.scale,
  view.cy + (point[1] - viewport.height / 2) / view.scale,
];
const limits = {minScale: 0.2, maxScale: 5};

test('zoom anchors the world point at an off-center cursor without mutating its view', () => {
  const view = Object.freeze({cx: 120, cy: -40, scale: 1.25});
  const viewport = {width: 800, height: 600};
  const cursor = [110, 430];
  const before = worldAt(view, cursor, viewport);
  const zoomed = zoomAt(view, cursor, 2, limits, viewport);
  const after = worldAt(zoomed, cursor, viewport);
  before.forEach((value, index) => close(after[index], value));
  close(zoomed.scale, 2.5);
  assert.notEqual(zoomed, view);
});

test('pinch combines midpoint translation and distance scaling in one gesture', () => {
  const view = Object.freeze({cx: 50, cy: 70, scale: 1});
  const viewport = {width: 800, height: 600};
  const start = [[200, 200], [400, 200]];
  const current = [[170, 260], [570, 260]];
  const pinched = pinchView(view, start, current, limits, viewport);
  close(pinched.scale, 2);
  const before = worldAt(view, [300, 200], viewport);
  const after = worldAt(pinched, [370, 260], viewport);
  before.forEach((value, index) => close(after[index], value));
});

test('scale limits preserve the zoom anchor and pinch midpoint movement', () => {
  const view = {cx: 20, cy: 10, scale: 1};
  const viewport = {width: 400, height: 600};
  const cursor = [370, 50];
  const anchor = worldAt(view, cursor, viewport);
  for (const [factor, expectedScale] of [[100, 5], [0.00001, 0.2], [Number.MAX_VALUE, 5]]) {
    const zoomed = zoomAt(view, cursor, factor, limits, viewport);
    assert.equal(zoomed.scale, expectedScale);
    worldAt(zoomed, cursor, viewport).forEach((value, index) => close(value, anchor[index]));
  }
  const pinched = pinchView(view, [[100, 300], [300, 300]], [[240, 330], [242, 330]], limits, viewport);
  assert.equal(pinched.scale, 0.2);
  worldAt(pinched, [241, 330], viewport).forEach((value, index) => close(value, worldAt(view, [200, 300], viewport)[index]));
});

test('fit includes the campus with padding in portrait and landscape viewports', () => {
  const bounds = {minX: -100, minY: 40, maxX: 750, maxY: 1400};
  for (const viewport of [{width: 390, height: 844}, {width: 1280, height: 720}]) {
    const view = fitView(bounds, viewport, 32);
    close(view.cx, 325);
    close(view.cy, 720);
    const box = visibleView(view, viewport);
    assert.ok(box.x <= bounds.minX - 32 / view.scale + 1e-9);
    assert.ok(box.y <= bounds.minY - 32 / view.scale + 1e-9);
    assert.ok(box.x + box.width >= bounds.maxX + 32 / view.scale - 1e-9);
    assert.ok(box.y + box.height >= bounds.maxY + 32 / view.scale - 1e-9);
  }
});

test('resize preserves center and screen scale while exposing the corresponding world viewport', () => {
  const view = {cx: 70, cy: 100, scale: 2};
  const portrait = visibleView(view, {width: 400, height: 800});
  const landscape = visibleView(view, {width: 800, height: 400});
  assert.deepEqual(portrait, {x: -30, y: -100, width: 200, height: 400});
  assert.deepEqual(landscape, {x: -130, y: 0, width: 400, height: 200});
  assert.deepEqual(panView(view, [60, -40]), {cx: 40, cy: 120, scale: 2});
  assert.deepEqual(view, {cx: 70, cy: 100, scale: 2});
});

test('invalid dimensions and non-finite inputs fail explicitly, and coincident touches stay usable', () => {
  const view = {cx: 0, cy: 0, scale: 1};
  const viewport = {width: 400, height: 600};
  assert.throws(() => fitView({minX: 0, minY: 0, maxX: 5, maxY: 5}, {width: 0, height: 600}), RangeError);
  assert.throws(() => visibleView({...view, scale: NaN}, viewport), RangeError);
  assert.throws(() => panView(view, [Infinity, 2]), RangeError);
  assert.throws(() => zoomAt(view, [200, 300], 0, limits, viewport), RangeError);
  assert.throws(() => zoomAt(view, [200, 300], 2, {minScale: 5, maxScale: 1}, viewport), RangeError);
  const result = pinchView(view, [[100, 200], [100, 200]], [[150, 230], [150, 230]], limits, viewport);
  assert.deepEqual(result, {cx: -50, cy: -30, scale: 1});
});
