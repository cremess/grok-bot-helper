const test = require('node:test');
const assert = require('node:assert/strict');
const { promptPosition, isBoundsVisible } = require('../src/lib/position');

test('reconhece janela dentro ou parcialmente visível no limite de 80 por 40', () => {
  const areas = [{ x: 0, y: 0, width: 1920, height: 1040 }];
  assert.equal(isBoundsVisible({ x: 100, y: 100, width: 680, height: 300 }, areas), true);
  assert.equal(isBoundsVisible({ x: 1840, y: 1000, width: 680, height: 300 }, areas), true);
  assert.equal(isBoundsVisible({ x: 1841, y: 1000, width: 680, height: 300 }, areas), false);
  assert.equal(isBoundsVisible({ x: 1840, y: 1001, width: 680, height: 300 }, areas), false);
  assert.equal(isBoundsVisible({ x: 1920, y: 1040, width: 680, height: 300 }, areas), false);
});

test('considera monitores negativos e rejeita monitor desconectado', () => {
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

test('centraliza no monitor principal com o topo a 25% da área', () => {
  assert.deepEqual(promptPosition({ x: 0, y: 0, width: 1920, height: 1040 }, size), {
    x: 640, y: 260,
  });
});

test('posiciona no monitor secundário com coordenadas negativas', () => {
  assert.deepEqual(promptPosition({ x: -1920, y: -1080, width: 1920, height: 1040 }, size), {
    x: -1280, y: -820,
  });
});

test('ancora na origem quando a área é menor que a janela', () => {
  assert.deepEqual(promptPosition({ x: -400, y: -100, width: 400, height: 100 }, size), {
    x: -400, y: -100,
  });
});

test('limita o topo para a janela caber verticalmente', () => {
  assert.deepEqual(promptPosition({ x: 10, y: 20, width: 641, height: 160 }, size), {
    x: 11, y: 30,
  });
});
