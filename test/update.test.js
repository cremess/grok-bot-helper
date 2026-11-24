const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RELEASES_URL, UPDATE_INTERVAL_MS, UPDATE_TIMEOUT_MS, parseVersion, compareVersions, isNewerVersion,
  isSafeReleaseUrl, parseRelease, updateNotice, shouldCheckForUpdate } = require('../src/lib/update');

const page = 'https://github.com/cremess/grok-bot-helper/releases/tag/v0.2.0';

test('asks the public releases API of this project, with a 10 s timeout, once a day', () => {
  assert.equal(RELEASES_URL, 'https://api.github.com/repos/cremess/grok-bot-helper/releases/latest');
  assert.equal(UPDATE_TIMEOUT_MS, 10000);
  assert.equal(UPDATE_INTERVAL_MS, 24 * 60 * 60 * 1000);
});

test('parseVersion accepts semver with an optional v and rejects anything else', () => {
  assert.deepEqual(parseVersion('v1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: [], text: '1.2.3' });
  assert.deepEqual(parseVersion('0.1.0-beta.2+build.5'),
    { major: 0, minor: 1, patch: 0, prerelease: ['beta', '2'], text: '0.1.0-beta.2' });
  for (const value of ['1.2', '1.2.3.4', '01.2.3', '1.2.3-', '1.2.3-01', 'v', 'latest', '', ' ', '1.2.3 extra',
    `1.2.3-${'a'.repeat(70)}`, null, undefined, 1, {}, '<b>1.2.3</b>']) {
    assert.equal(parseVersion(value), null, String(value));
  }
});

test('compares versions with semver precedence', () => {
  const order = ['0.1.0', '0.1.1', '0.2.0-alpha', '0.2.0-alpha.1', '0.2.0-alpha.beta', '0.2.0-beta',
    '0.2.0-beta.2', '0.2.0-beta.11', '0.2.0-rc.1', '0.2.0', '0.10.0', '1.0.0'];
  for (let index = 1; index < order.length; index += 1) {
    const [a, b] = [parseVersion(order[index - 1]), parseVersion(order[index])];
    assert.equal(compareVersions(a, b), -1, `${order[index - 1]} < ${order[index]}`);
    assert.equal(compareVersions(b, a), 1, `${order[index]} > ${order[index - 1]}`);
  }
  assert.equal(compareVersions(parseVersion('v1.0.0'), parseVersion('1.0.0+meta')), 0);
});

test('isNewerVersion is true only for a strictly greater valid version', () => {
  assert.equal(isNewerVersion('v0.2.0', '0.1.0'), true);
  assert.equal(isNewerVersion('0.1.1', '0.1.0'), true);
  assert.equal(isNewerVersion('0.1.0', '0.1.0'), false);
  assert.equal(isNewerVersion('0.0.9', '0.1.0'), false);
  assert.equal(isNewerVersion('0.1.0-rc.1', '0.1.0'), false);
  assert.equal(isNewerVersion('0.1.0', '0.1.0-rc.1'), true);
  assert.equal(isNewerVersion('garbage', '0.1.0'), false);
  assert.equal(isNewerVersion('1.0.0', 'garbage'), false);
});

test('only https release pages of this project on github.com may be opened', () => {
  assert.equal(isSafeReleaseUrl(page), true);
  assert.equal(isSafeReleaseUrl('https://github.com/cremess/grok-bot-helper/releases/latest'), true);
  for (const url of [
    'http://github.com/cremess/grok-bot-helper/releases/tag/v0.2.0',
    'https://github.com.evil.example/cremess/grok-bot-helper/releases/tag/v0.2.0',
    'https://evil.example/github.com/cremess/grok-bot-helper/releases/',
    'https://user:pass@github.com/cremess/grok-bot-helper/releases/tag/v1',
    'https://github.com:8443/cremess/grok-bot-helper/releases/tag/v1',
    'https://github.com/someone-else/grok-bot-helper/releases/tag/v1',
    'https://gist.github.com/cremess/grok-bot-helper/releases/tag/v1',
    'javascript:alert(1)', 'file:///C:/Windows', 'grokbot://app/v1/open', '', 'not a url',
    `https://github.com/cremess/grok-bot-helper/releases/${'a'.repeat(2100)}`, null, 42,
  ]) assert.equal(isSafeReleaseUrl(url), false, String(url).slice(0, 80));
});

test('parseRelease reads only tag_name and html_url and rejects bad answers', () => {
  assert.deepEqual(parseRelease({ tag_name: 'v0.2.0', html_url: page, body: 'ignored', assets: [{}] }),
    { version: '0.2.0', url: page });
  for (const data of [null, undefined, 'text', [], {}, { tag_name: 'v0.2.0' }, { html_url: page },
    { tag_name: 'nightly', html_url: page }, { tag_name: 'v0.2.0', html_url: 'https://evil.example/' },
    { tag_name: 2, html_url: page }, { message: 'Not Found' }]) {
    assert.equal(parseRelease(data), null, JSON.stringify(data));
  }
});

test('updateNotice appears only for a newer release with a safe page', () => {
  assert.deepEqual(updateNotice({ tag_name: 'v0.2.0', html_url: page }, '0.1.0'), { version: '0.2.0', url: page });
  assert.equal(updateNotice({ tag_name: 'v0.1.0', html_url: page }, '0.1.0'), null);
  assert.equal(updateNotice({ tag_name: 'v0.2.0', html_url: 'http://github.com/x' }, '0.1.0'), null);
  assert.equal(updateNotice(null, '0.1.0'), null);
});

test('shouldCheckForUpdate needs the option on and waits a day between checks', () => {
  const now = 1_800_000_000_000;
  assert.equal(shouldCheckForUpdate({ enabled: false, lastCheckMs: 0, nowMs: now }), false);
  assert.equal(shouldCheckForUpdate({ enabled: 'yes', lastCheckMs: 0, nowMs: now }), false);
  assert.equal(shouldCheckForUpdate({ enabled: true, lastCheckMs: 0, nowMs: now }), true);
  assert.equal(shouldCheckForUpdate({ enabled: true, lastCheckMs: undefined, nowMs: now }), true);
  assert.equal(shouldCheckForUpdate({ enabled: true, lastCheckMs: now - UPDATE_INTERVAL_MS + 1, nowMs: now }), false);
  assert.equal(shouldCheckForUpdate({ enabled: true, lastCheckMs: now - UPDATE_INTERVAL_MS, nowMs: now }), true);
  // A check recorded in the future (clock moved back) doesn't block checks forever.
  assert.equal(shouldCheckForUpdate({ enabled: true, lastCheckMs: now + 5 * 60 * 1000, nowMs: now }), true);
  assert.equal(shouldCheckForUpdate({ enabled: true, lastCheckMs: now + 1000, nowMs: now }), false);
});
