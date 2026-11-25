const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { encodeBase32 } = require('../src/lib/roster');
const { normalizeComposerText, composerMatches, readPromptConfirmDismissed } = require('../src/lib/composer');

test('composer comparison normalizes whitespace and preserves case and internal indentation', () => {
  assert.ok(composerMatches('  One\u00a0two \r\n  three\t\rfour ', 'One two\n  three\nfour'));
  assert.equal(composerMatches('One\n two', 'One\ntwo'), false);
  assert.equal(composerMatches('ONE', 'one'), false);
  for (const empty of [null, {}, undefined, '', ' \r\n\t']) {
    assert.equal(normalizeComposerText(empty), '');
    assert.equal(composerMatches('', empty), false);
  }
});

test('confirmation preference is read only when present and boolean', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'composer-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, encodeBase32('sand.client.slice.account.example.ui-agent-refs') + '.blob');
  assert.equal(readPromptConfirmDismissed(dir), null);
  for (const flag of [true, false, 'true', undefined]) {
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, value: { isPromptLinkConfirmDismissed: flag } }));
    assert.equal(readPromptConfirmDismissed(dir), typeof flag === 'boolean' ? flag : null);
  }
  fs.writeFileSync(file, '{');
  assert.equal(readPromptConfirmDismissed(dir), null);
});
