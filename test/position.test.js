const test = require('node:test');
const assert = require('node:assert/strict');
const { promptPosition } = require('../src/lib/position');

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
