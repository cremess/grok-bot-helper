const test = require('node:test');
const assert = require('node:assert');
const packageJson = require('../package.json');

test('define os scripts e fixa a versão do Electron', () => {
  assert.strictEqual(packageJson.scripts.start, 'electron .');
  assert.strictEqual(packageJson.scripts.test, 'node --test');
  assert.strictEqual(packageJson.devDependencies.electron, '45.2.3');
});
