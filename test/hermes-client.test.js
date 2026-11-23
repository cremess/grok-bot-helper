const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  HERMES_SESSION, DEFAULT_TIMEOUT_MS, MAX_OUTPUT_BYTES, defaultHermesPath, isValidHermesName, isHermesPathFormat,
  hermesPathError, buildHermesArgs, summarizeError, cleanOutput, runHermes, killProcessTreeSync,
} = require('../src/lib/hermes-client');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-hermes-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));

// A stand-in for hermes.exe: a Node script that reads stdin and behaves as FAKE_MODE says. It is written
// to a temporary folder (files under test/ would be picked up as tests).
const fakeHermes = path.join(root, 'fake-hermes.js');
fs.writeFileSync(fakeHermes, `
const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  const input = Buffer.concat(chunks).toString('utf8');
  const mode = process.env.FAKE_MODE;
  if (mode === 'echo') {
    process.stderr.write('session_id: 20260101_000000_abcdef\\n');
    process.stdout.write('\\u001b[1m' + JSON.stringify({ input, args: process.argv.slice(2) }) + '\\u001b[0m\\n');
  } else if (mode === 'fail') {
    process.stderr.write('Traceback (most recent call last):\\nProvider error: api_key=sk-abcdefghijklmnop invalid\\nsession_id: x\\n');
    process.exit(3);
  } else if (mode === 'big') {
    process.stdout.write('a'.repeat(300 * 1024));
  } else if (mode === 'sleep') {
    setTimeout(() => process.stdout.write('late'), 60000);
  }
});
`);

function run(mode, extra = {}) {
  return runHermes({ executable: process.execPath, args: [fakeHermes, ...buildHermesArgs(extra.options)],
    input: extra.input ?? 'Hello', env: { ...process.env, FAKE_MODE: mode }, ...extra.run });
}

test('the default path is under the local app data folder', () => {
  assert.equal(defaultHermesPath('C:\\Users\\someone\\AppData\\Local'), 'C:\\Users\\someone\\AppData\\Local\\hermes\\bin\\hermes.exe');
  assert.equal(defaultHermesPath(''), '');
  assert.equal(defaultHermesPath(undefined), '');
  assert.equal(HERMES_SESSION, 'grok-bot-helper');
  assert.equal(DEFAULT_TIMEOUT_MS, 600000);
  assert.equal(MAX_OUTPUT_BYTES, 204800);
});

test('model and provider names are checked strictly', () => {
  for (const value of ['', 'anthropic/claude-sonnet-4', 'gpt-4.1', 'openrouter', 'local:llama3', 'a'.repeat(100)]) {
    assert.equal(isValidHermesName(value), true, value);
  }
  for (const value of ['-m', '--yolo', 'a b', 'a"b', 'a;b', 'a&b', 'a|b', '$(x)', 'a'.repeat(101), 'x\n', null, 3]) {
    assert.equal(isValidHermesName(value), false, String(value));
  }
});

test('the executable must be a full local path to a hermes.exe file that exists', () => {
  for (const value of ['C:\\Tools\\hermes.exe', 'D:\\a b\\HERMES.EXE']) assert.equal(isHermesPathFormat(value), true, value);
  for (const value of ['hermes.exe', '.\\hermes.exe', '\\\\server\\share\\hermes.exe', 'C:\\Tools\\hermes.bat', 'C:\\Tools\\hermes', 'C:\\Tools\\other.exe',
    'C:\\Windows\\System32\\cmd.exe', 'C:\\Tools\\hermes.exe.exe', 'C:\\Tools\\my-hermes.exe', 'C:\\Tools\\hermes.exe\\',
    'C:\\Tools\\.exe', 'C:\\Tools\\he"rmes.exe', 'C:\\Tools\\a|b.exe', 'C:\\Tools\\x.exe:stream.exe', 'C:/Tools/hermes.exe',
    `C:\\${'a'.repeat(1100)}.exe`, '', null]) {
    assert.equal(isHermesPathFormat(value), false, String(value));
  }
  const exe = path.join(root, 'hermes.exe');
  fs.writeFileSync(exe, 'fake');
  assert.equal(hermesPathError(exe), null);
  assert.equal(hermesPathError(path.join(root, 'missing', 'hermes.exe')), 'missing');
  fs.mkdirSync(path.join(root, 'folder', 'hermes.exe'), { recursive: true });
  assert.equal(hermesPathError(path.join(root, 'folder', 'hermes.exe')), 'missing');
  assert.equal(hermesPathError('hermes.exe'), 'invalid');
  fs.writeFileSync(path.join(root, 'other.exe'), 'fake');
  assert.equal(hermesPathError(path.join(root, 'other.exe')), 'invalid');
  assert.equal(hermesPathError('C:\\x\\hermes.exe', () => ({ isFile: () => true })), null);
});

test('arguments put the message on stdin and add model, provider and the app session only when asked', () => {
  const base = ['chat', '--query-file', '-', '--oneshot', '-Q'];
  assert.deepEqual(buildHermesArgs({ continueSession: false }), base);
  assert.deepEqual(buildHermesArgs(), [...base, '--continue', 'grok-bot-helper', '--create-if-missing']);
  assert.deepEqual(buildHermesArgs({ model: 'anthropic/claude-sonnet-4', provider: 'openrouter', continueSession: false }),
    [...base, '-m', 'anthropic/claude-sonnet-4', '--provider', 'openrouter']);
  assert.deepEqual(buildHermesArgs({ model: '--yolo', provider: 'a b', continueSession: false }), base);
});

test('stderr summaries drop the session line and anything that looks like a secret', () => {
  assert.equal(summarizeError('\u001b[31mError:\u001b[0m bad model\nsession_id: 123\n'), 'Error: bad model');
  const summary = summarizeError('Authorization: Bearer abc.def\napi_key=sk-1234567890abcdef\ntoken: "xyz123"\nAIzaSyA1234567890');
  assert.doesNotMatch(summary, /abc\.def|sk-1234567890abcdef|xyz123|AIzaSyA1234567890/);
  assert.equal(summarizeError('1\n2\n3\n4\n5\n6'), '3 4 5 6');
  assert.equal([...summarizeError('x'.repeat(1000))].length, 300);
  assert.equal(summarizeError(null), '');
});

test('output is decoded as UTF-8, without colors, and a character cut at the limit is dropped', () => {
  assert.equal(cleanOutput(Buffer.from('\u001b[1m Olá, ação 🎉 \u001b[0m\n')), 'Olá, ação 🎉');
  assert.equal(cleanOutput(Buffer.from('ok é').subarray(0, 4)), 'ok');
});

test('the fake hermes gets the text on stdin, not on the command line, and its stdout is the answer', async () => {
  const input = 'Olá! "quotes" $(whoami) `ticks` & | > 🎉';
  const result = await run('echo', { input, options: { model: 'test-model' } });
  assert.equal(result.ok, true);
  assert.equal(result.clipped, false);
  const echoed = JSON.parse(result.answer);
  assert.equal(echoed.input, input);
  assert.deepEqual(echoed.args, ['chat', '--query-file', '-', '--oneshot', '-Q', '-m', 'test-model',
    '--continue', 'grok-bot-helper', '--create-if-missing']);
  assert.ok(!echoed.args.some((arg) => arg.includes('Olá')));
});

test('a non-zero exit is an error with a cleaned stderr summary', async () => {
  const result = await run('fail');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'exit');
  assert.equal(result.code, 3);
  assert.match(result.detail, /Provider error/);
  assert.doesNotMatch(result.detail, /sk-abcdefghijklmnop|session_id/);
});

test('stdout is limited and the answer says it was clipped', async () => {
  const result = await run('big', { run: { maxOutputBytes: 1000 } });
  assert.equal(result.ok, true);
  assert.equal(result.clipped, true);
  assert.equal(result.answer.length, 1000);
});

test('a slow hermes is stopped at the timeout', async () => {
  const killed = [];
  const started = Date.now();
  const result = await run('sleep', { run: { timeoutMs: 300, kill: (child) => { killed.push(child.pid); child.kill(); } } });
  assert.deepEqual(result, { ok: false, error: 'timeout' });
  assert.equal(killed.length, 1);
  assert.ok(Date.now() - started < 10000);
});

test('the default kill ends a slow hermes too', async () => {
  const result = await run('sleep', { run: { timeoutMs: 300 } });
  assert.deepEqual(result, { ok: false, error: 'timeout' });
});

test('a stopped run resolves only after the process exited', async () => {
  let child;
  let exited = false;
  const controller = new AbortController();
  const pending = run('sleep', { run: { signal: controller.signal, onSpawn: (value) => {
    child = value;
    child.on('exit', () => { exited = true; });
  } } });
  setTimeout(() => controller.abort(), 150);
  assert.deepEqual(await pending, { ok: false, error: 'cancelled' });
  assert.equal(exited, true);
});

test('a process that ignores the kill is given up on after the grace period', async () => {
  const controller = new AbortController();
  const started = Date.now();
  let child;
  const pending = run('sleep', { run: { signal: controller.signal, exitGraceMs: 200, kill: () => {},
    onSpawn: (value) => { child = value; } } });
  setTimeout(() => controller.abort(), 100);
  assert.deepEqual(await pending, { ok: false, error: 'cancelled' });
  assert.ok(Date.now() - started < 5000);
  killProcessTreeSync(child);
});

test('the synchronous kill ends a running hermes (used when the app quits)', async () => {
  let child;
  const pending = run('sleep', { run: { onSpawn: (value) => { child = value; } } });
  await new Promise((resolve) => setTimeout(resolve, 150));
  killProcessTreeSync(child);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.error, 'exit');
  assert.doesNotThrow(() => killProcessTreeSync(child));
  assert.doesNotThrow(() => killProcessTreeSync(undefined));
});

test('a run can be cancelled, also before it starts', async () => {
  const controller = new AbortController();
  const pending = run('sleep', { run: { signal: controller.signal } });
  setTimeout(() => controller.abort(), 100);
  assert.deepEqual(await pending, { ok: false, error: 'cancelled' });
  let spawned = false;
  const aborted = AbortSignal.abort();
  assert.deepEqual(await runHermes({ executable: process.execPath, args: [], input: '', signal: aborted,
    spawnImpl: () => { spawned = true; } }), { ok: false, error: 'cancelled' });
  assert.equal(spawned, false);
});

test('a missing executable is reported as not started', async () => {
  const result = await runHermes({ executable: path.join(root, 'nope', 'hermes.exe'), args: ['chat'], input: 'x' });
  assert.deepEqual(result, { ok: false, error: 'spawn-failed' });
});

test('spawn is called without a shell and with a hidden window', async () => {
  let options;
  await runHermes({ executable: 'C:\\x\\hermes.exe', args: ['chat'], input: 'x',
    spawnImpl: (_file, _args, value) => { options = value; throw new Error('stop'); } });
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  assert.equal(options.env.PYTHONIOENCODING, 'utf-8');
});
