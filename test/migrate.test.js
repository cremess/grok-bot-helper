const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { migrateUserData } = require('../src/lib/migrate');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'helper-migration-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const oldDir = path.join(root, 'grokbot-assistant');
  const newDir = path.join(root, 'grok-bot-helper');
  fs.mkdirSync(oldDir);
  return { oldDir, newDir };
}

test('migrates settings and history without changing the originals', (t) => {
  const { oldDir, newDir } = fixture(t);
  for (const file of ['settings.json', 'history.json']) fs.writeFileSync(path.join(oldDir, file), '{}');
  assert.deepEqual(migrateUserData(oldDir, newDir).migrated.sort(), ['history.json', 'settings.json']);
  for (const file of ['settings.json', 'history.json']) {
    assert.equal(fs.readFileSync(path.join(newDir, file), 'utf8'), '{}');
    assert.equal(fs.readFileSync(path.join(oldDir, file), 'utf8'), '{}');
  }
  assert.deepEqual(migrateUserData(oldDir, newDir), { migrated: [] });
});

test('skips both files when new settings exist', (t) => {
  const { oldDir, newDir } = fixture(t);
  fs.mkdirSync(newDir);
  fs.writeFileSync(path.join(newDir, 'settings.json'), 'new');
  for (const file of ['settings.json', 'history.json']) fs.writeFileSync(path.join(oldDir, file), 'old');
  assert.deepEqual(migrateUserData(oldDir, newDir), { migrated: [] });
  assert.equal(fs.readFileSync(path.join(newDir, 'settings.json'), 'utf8'), 'new');
  assert.equal(fs.existsSync(path.join(newDir, 'history.json')), false);
});

test('creates the destination when the old folder is missing', (t) => {
  const { oldDir, newDir } = fixture(t);
  assert.deepEqual(migrateUserData(path.join(oldDir, 'missing'), newDir), { migrated: [] });
  assert.equal(fs.statSync(newDir).isDirectory(), true);
});

test('migrates settings alone', (t) => {
  const { oldDir, newDir } = fixture(t);
  fs.writeFileSync(path.join(oldDir, 'settings.json'), '{}');
  assert.deepEqual(migrateUserData(oldDir, newDir), { migrated: ['settings.json'] });
  assert.equal(fs.readFileSync(path.join(newDir, 'settings.json'), 'utf8'), '{}');
});

test('does not throw when the destination cannot be a directory', (t) => {
  const { oldDir, newDir } = fixture(t);
  fs.writeFileSync(newDir, 'occupied');
  assert.deepEqual(migrateUserData(oldDir, newDir), { migrated: [] });
});
