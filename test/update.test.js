const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isLoopbackFeed } = require('../src/lib/update');

test('accepts HTTP feeds with a literal loopback host and explicit port', () => {
  for (const url of [
    'http://127.0.0.1:8080/releases/',
    'http://localhost:65535/',
    'HTTP://LOCALHOST:80/',
    'http://localhost:8123',
  ]) assert.equal(isLoopbackFeed(url), true, url);
});

test('rejects feeds with other hosts, schemes, or missing or invalid ports', () => {
  for (const url of [
    'https://127.0.0.1:8080/',
    'http://127.0.0.1/',
    'http://localhost:0/',
    'http://localhost:65536/',
    'http://localhost:port/',
    'http://localhost:/',
    'http://127.1:8080/',
    'http://0x7f000001:8080/',
    'http://[::1]:8080/',
    'http://localhost.:8080/',
    'http://localhost.example:8080/',
    'http://192.0.2.1:8080/',
    'http://example.invalid:8080/',
    'file:///updates/',
  ]) assert.equal(isLoopbackFeed(url), false, url);
});

test('rejects credentials, ambiguous input and non-strings', () => {
  for (const value of [
    'http://user:pass@localhost:8080/',
    'http://localhost:8080@elsewhere.invalid/',
    'http://localhost:8080\\@elsewhere.invalid/',
    'http://%6cocalhost:8080/',
    'http://local\nhost:8080/',
    ' http://localhost:8080/',
    '', null, undefined, 123, {},
  ]) assert.equal(isLoopbackFeed(value), false, String(value));
});
