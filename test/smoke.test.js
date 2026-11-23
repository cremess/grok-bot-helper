const test = require('node:test');
const assert = require('node:assert');
const packageJson = require('../package.json');

test('defines scripts and pins the Electron version', () => {
  assert.strictEqual(packageJson.scripts.start, 'electron .');
  assert.strictEqual(packageJson.scripts.test, 'node --test');
  assert.strictEqual(packageJson.devDependencies.electron, '45.2.3');
});
