const test = require('node:test');
const assert = require('node:assert/strict');
const { promptPosition, isBoundsVisible } = require('../src/lib/position');

test('recognizes fully or partially visible windows at the 80 by 40 threshold', () => {
  const areas = [{ x: 0, y: 0, width: 1920, height: 1040 }];
  assert.equal(isBoundsVisible({ x: 100, y: 100, width: 680, height: 300 }, areas), true);
  assert.equal(isBoundsVisible({ x: 1840, y: 1000, width: 680, height: 300 }, areas), true);
  assert.equal(isBoundsVisible({ x: 1841, y: 1000, width: 680, height: 300 }, areas), false);
  assert.equal(isBoundsVisible({ x: 1840, y: 1001, width: 680, height: 300 }, areas), false);
  assert.equal(isBoundsVisible({ x: 1920, y: 1040, width: 680, height: 300 }, areas), false);
});

test('handles negative monitors and rejects disconnected monitors', () => {
  const bounds = { x: -1800, y: -900, width: 680, height: 300 };
  const primary = { x: 0, y: 0, width: 1920, height: 1040 };
  const secondary = { x: -1920, y: -1080, width: 1920, height: 1040 };
  assert.equal(isBoundsVisible(bounds, [primary, secondary]), true);
  assert.equal(isBoundsVisible(bounds, [primary]), false);
  assert.equal(isBoundsVisible(bounds, []), false);
  assert.equal(isBoundsVisible(null, [primary]), false);
  assert.equal(isBoundsVisible({ x: -20, y: -10, width: 30, height: 20 }, [primary], { width: 10, height: 10 }), true);
});

const size = { width: 640, height: 150 };

test('centers on the primary monitor with the top at 25% of the work area', () => {
  assert.deepEqual(promptPosition({ x: 0, y: 0, width: 1920, height: 1040 }, size), {
    x: 640, y: 260,
  });
});

test('positions on a secondary monitor with negative coordinates', () => {
  assert.deepEqual(promptPosition({ x: -1920, y: -1080, width: 1920, height: 1040 }, size), {
    x: -1280, y: -820,
  });
});

test('anchors at the origin when the work area is smaller than the window', () => {
  assert.deepEqual(promptPosition({ x: -400, y: -100, width: 400, height: 100 }, size), {
    x: -400, y: -100,
  });
});

test('limits the top position to fit the window vertically', () => {
  assert.deepEqual(promptPosition({ x: 10, y: 20, width: 641, height: 160 }, size), {
    x: 11, y: 30,
  });
});
