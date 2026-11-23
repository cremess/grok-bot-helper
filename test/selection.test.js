const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SELECTION_TIMEOUT_MS, clipSelection, selectionPollDecision, restorePlan } = require('../src/lib/selection');

test('clipSelection trims, normalizes line breaks and cuts by code points', () => {
  assert.deepEqual(clipSelection('  hello\r\nworld\r  ', 1000), { text: 'hello\nworld', clipped: false });
  assert.deepEqual(clipSelection('a'.repeat(1000), 1000), { text: 'a'.repeat(1000), clipped: false });
  assert.deepEqual(clipSelection('a'.repeat(1001), 1000), { text: 'a'.repeat(1000), clipped: true });
  // Emoji are one character each, and a cut never splits a surrogate pair.
  const emoji = '\u{1F600}'.repeat(5);
  assert.deepEqual(clipSelection(emoji, 3), { text: '\u{1F600}'.repeat(3), clipped: true });
  assert.deepEqual(clipSelection(emoji, 5), { text: emoji, clipped: false });
  // Whitespace at the cut point is dropped.
  assert.deepEqual(clipSelection('abc def', 4), { text: 'abc', clipped: true });
  for (const value of [undefined, null, 42, {}, '', '   ']) {
    assert.deepEqual(clipSelection(value, 1000), { text: '', clipped: false });
  }
});

test('selectionPollDecision waits for text and stops early when something else was copied', () => {
  assert.equal(SELECTION_TIMEOUT_MS, 600);
  assert.equal(selectionPollDecision({ text: '', formats: [], elapsedMs: 0 }), 'wait');
  assert.equal(selectionPollDecision({ text: '', formats: [], elapsedMs: 599 }), 'wait');
  assert.equal(selectionPollDecision({ text: '', formats: [], elapsedMs: 600 }), 'timeout');
  assert.equal(selectionPollDecision({ text: 'x', formats: ['text/plain'], elapsedMs: 0 }), 'text');
  assert.equal(selectionPollDecision({ text: 'x', formats: [], elapsedMs: 9999 }), 'text');
  assert.equal(selectionPollDecision({ text: '  \n', formats: ['text/plain'], elapsedMs: 0 }), 'no-text');
  assert.equal(selectionPollDecision({ text: '', formats: ['image/png'], elapsedMs: 0 }), 'no-text');
  assert.equal(selectionPollDecision({ text: undefined, formats: undefined, elapsedMs: 100, timeoutMs: 50 }), 'timeout');
});

test('restorePlan writes back every restorable format and clears an empty clipboard', () => {
  const image = { isEmpty: () => false };
  assert.deepEqual(restorePlan({ text: 'a', html: '<b>a</b>', rtf: '{\\rtf1 a}', image }),
    { action: 'write', data: { text: 'a', html: '<b>a</b>', rtf: '{\\rtf1 a}', image } });
  assert.deepEqual(restorePlan({ text: '', html: '', rtf: '', image }), { action: 'write', data: { image } });
  assert.deepEqual(restorePlan({ text: ' ', html: '', rtf: '', image: null }), { action: 'write', data: { text: ' ' } });
  for (const snapshot of [{ text: '', html: '', rtf: '', image: null }, {}, null, undefined,
    { text: 1, html: {}, rtf: [] }]) {
    assert.deepEqual(restorePlan(snapshot), { action: 'clear' });
  }
});

test('restorePlan clears instead of rewriting a clipboard marked as private', () => {
  for (const format of ['ExcludeClipboardContentFromMonitorProcessing', 'CanIncludeInClipboardHistory',
    'CanUploadToCloudClipboard', 'Clipboard Viewer Ignore']) {
    assert.deepEqual(restorePlan({ text: 'secret', formats: ['text/plain', format] }), { action: 'clear' }, format);
  }
  assert.deepEqual(restorePlan({ text: 'hello', formats: ['text/plain'] }), { action: 'write', data: { text: 'hello' } });
});
