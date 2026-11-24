// Runs the local Hermes Agent CLI for one answer:
//   hermes.exe chat --query-file - --oneshot -Q [-m <model>] [--provider <provider>]
//     [--continue grok-bot-helper --create-if-missing]
// The message goes in through stdin, never on the command line, and no shell is involved. With -Q,
// Hermes prints only the final answer on stdout (session details and errors go to stderr). Hermes uses
// whatever provider the user configured in it; this app sends nothing anywhere itself.

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile, execFileSync } = require('node:child_process');

// Fixed session name, so "continue the conversation" always means this app's own Hermes thread.
const HERMES_SESSION = 'grok-bot-helper';
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT_BYTES = 200 * 1024;
const MAX_STDERR_BYTES = 16 * 1024;
const MAX_DETAIL_LENGTH = 300;
// After a stop or a timeout, how long to wait for Hermes to really exit before giving up on it.
const EXIT_GRACE_MS = 5000;
// Model and provider names such as "anthropic/claude-sonnet-4" or "openrouter". No spaces, no quotes,
// and no leading dash, so a value can't be read as another option.
const NAME_PATTERN = /^[A-Za-z0-9._:/][A-Za-z0-9._:/-]{0,99}$/;
const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;

function defaultHermesPath(localAppData) {
  return typeof localAppData === 'string' && localAppData ? path.win32.join(localAppData, 'hermes', 'bin', 'hermes.exe') : '';
}

// An empty value means "not set" (the default path or Hermes's own default is used).
function isValidHermesName(value) {
  return value === '' || (typeof value === 'string' && NAME_PATTERN.test(value));
}

// A full local Windows path to hermes.exe, like C:\Users\me\AppData\Local\hermes\bin\hermes.exe.
// Other programs, network paths and characters Windows doesn't allow in paths are refused.
function isHermesPathFormat(value) {
  return typeof value === 'string' && value.length <= 1024 && /^[A-Za-z]:\\/.test(value)
    && !/[\u0000-\u001f"<>|?*]/.test(value) && !value.slice(2).includes(':') && !/[\\/]$/.test(value)
    && path.win32.basename(value).toLowerCase() === 'hermes.exe';
}

// null when the path is usable, 'invalid' when it isn't a local .exe path, 'missing' when no such file.
function hermesPathError(value, statSync = fs.statSync) {
  if (!isHermesPathFormat(value)) return 'invalid';
  try {
    return statSync(value).isFile() ? null : 'missing';
  } catch {
    return 'missing';
  }
}

function buildHermesArgs({ model = '', provider = '', continueSession = true } = {}) {
  const args = ['chat', '--query-file', '-', '--oneshot', '-Q'];
  if (model && isValidHermesName(model)) args.push('-m', model);
  if (provider && isValidHermesName(provider)) args.push('--provider', provider);
  // Without --create-if-missing, the first message would fail because the session doesn't exist yet.
  if (continueSession) args.push('--continue', HERMES_SESSION, '--create-if-missing');
  return args;
}

function cut(text, max) {
  const points = [...text];
  return points.length > max ? `${points.slice(0, max - 1).join('')}\u2026` : text;
}

// A short, single-line summary of what Hermes wrote to stderr: the last few lines, without the session
// line, terminal colors or anything that looks like a key or token.
function summarizeError(text) {
  if (typeof text !== 'string') return '';
  const lines = text.replace(ANSI_PATTERN, '').split(/\r?\n/)
    .map((line) => line.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim())
    .filter((line) => line && !/^session[_ ]id\s*:/i.test(line));
  const summary = lines.slice(-4).join(' ')
    .replace(/\b(?:sk|pk|rk|ghp|gho|ghs|github_pat|xox[abprs]|AIza)[-_A-Za-z0-9]{8,}/g, '[hidden]')
    .replace(/\b(bearer\s+)\S+/gi, '$1[hidden]')
    .replace(/\b((?:api[_-]?key|token|secret|password|authorization)["']?\s*[=:]\s*["']?)[^\s"',;]+/gi, '$1[hidden]');
  return cut(summary, MAX_DETAIL_LENGTH);
}

// Turns stdout into the answer: UTF-8, terminal colors removed, trimmed. A cut at the byte limit can split
// a character; the broken tail is dropped.
function cleanOutput(buffer) {
  return buffer.toString('utf8').replace(/\uFFFD+$/, '').replace(ANSI_PATTERN, '').trim();
}

// Ends the process and anything it started (hermes.exe can start helpers). On Windows that takes taskkill.
function killProcessTree(child) {
  if (!child || !child.pid) return;
  if (process.platform === 'win32') {
    const taskkill = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
    execFile(taskkill, ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, () => {
      try { child.kill(); } catch { /* Already gone. */ }
    });
  } else {
    try { child.kill('SIGKILL'); } catch { /* Already gone. */ }
  }
}

// The same, waiting for taskkill to finish: used when the app quits and can't wait for a callback.
function killProcessTreeSync(child) {
  if (!child || !child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    const taskkill = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
    try {
      execFileSync(taskkill, ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 3000, stdio: 'ignore' });
    } catch { /* Already gone, or taskkill failed; fall back to ending the process itself. */ }
  }
  try { child.kill('SIGKILL'); } catch { /* Already gone. */ }
}

// Runs Hermes once and resolves to { ok: true, answer, clipped } or { ok: false, error } with error
// 'spawn-failed', 'timeout', 'cancelled' or 'exit' (with code and a cleaned stderr summary). Stdout is
// kept up to `maxOutputBytes`; `clipped` says when the answer was cut there. After a stop or a timeout it
// resolves only once the process exited (or after a few seconds if it never does), so two Hermes runs
// never share the session. `onSpawn` gets the child process.
function runHermes({ executable, args, input, timeoutMs = DEFAULT_TIMEOUT_MS, maxOutputBytes = MAX_OUTPUT_BYTES,
  signal, spawnImpl = spawn, kill = killProcessTree, env = process.env, onSpawn, exitGraceMs = EXIT_GRACE_MS }) {
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    let child;
    // Set when the run was stopped or timed out: the result to give once the process is gone.
    let ending;
    const stdout = [];
    let stdoutBytes = 0;
    let clipped = false;
    let stderr = Buffer.alloc(0);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const end = (result) => {
      if (settled || ending) return;
      ending = result;
      clearTimeout(timer);
      kill(child);
      timer = setTimeout(() => finish(ending), exitGraceMs);
    };
    const onAbort = () => end({ ok: false, error: 'cancelled' });
    if (signal?.aborted) return finish({ ok: false, error: 'cancelled' });
    try {
      child = spawnImpl(executable, args, {
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        // Hermes is a Python program: without this, Windows pipes would use the ANSI code page and
        // accented letters or emoji in the message or the answer would break.
        env: { ...env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      });
    } catch {
      return finish({ ok: false, error: 'spawn-failed' });
    }
    if (typeof onSpawn === 'function') onSpawn(child);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => end({ ok: false, error: 'timeout' }), timeoutMs);
    child.on('error', () => finish(ending || { ok: false, error: 'spawn-failed' }));
    child.stdout.on('data', (chunk) => {
      if (stdoutBytes >= maxOutputBytes) {
        clipped = true;
        return;
      }
      const room = maxOutputBytes - stdoutBytes;
      if (chunk.length > room) clipped = true;
      const kept = chunk.length > room ? chunk.subarray(0, room) : chunk;
      stdout.push(kept);
      stdoutBytes += kept.length;
    });
    child.stderr.on('data', (chunk) => {
      stderr = Buffer.concat([stderr, chunk]);
      if (stderr.length > MAX_STDERR_BYTES) stderr = stderr.subarray(stderr.length - MAX_STDERR_BYTES);
    });
    child.on('close', (code) => {
      if (ending) finish(ending);
      else if (code === 0) finish({ ok: true, answer: cleanOutput(Buffer.concat(stdout)), clipped });
      else finish({ ok: false, error: 'exit', code: code ?? -1, detail: summarizeError(stderr.toString('utf8')) });
    });
    // Hermes may exit before reading everything (a bad option, for example); ignore the broken pipe.
    child.stdin.on('error', () => {});
    child.stdin.end(typeof input === 'string' ? input : '', 'utf8');
  });
}

module.exports = {
  HERMES_SESSION,
  DEFAULT_TIMEOUT_MS,
  MAX_OUTPUT_BYTES,
  defaultHermesPath,
  isValidHermesName,
  isHermesPathFormat,
  hermesPathError,
  buildHermesArgs,
  summarizeError,
  cleanOutput,
  killProcessTree,
  killProcessTreeSync,
  runHermes,
};
