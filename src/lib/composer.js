const fs = require('node:fs');
const { findPersistenceFile } = require('./roster');

const AUTO_SEND_EXIT = Object.freeze({ sent: 0, mismatch: 3, noComposer: 4, notForeground: 5, timeout: 6 });

function normalizeComposerText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ')
    .split('\n').map((line) => line.trimEnd()).join('\n').trim();
}

function composerMatches(actual, expected) {
  const wanted = normalizeComposerText(expected);
  return wanted !== '' && normalizeComposerText(actual) === wanted;
}

function readPromptConfirmDismissed(dir) {
  try {
    const file = findPersistenceFile(dir, /^sand\.client\.slice\.account\..+\.ui-agent-refs$/);
    if (!file) return null;
    const flag = JSON.parse(fs.readFileSync(file, 'utf8'))?.value?.isPromptLinkConfirmDismissed;
    return typeof flag === 'boolean' ? flag : null;
  } catch {
    return null;
  }
}

module.exports = { AUTO_SEND_EXIT, normalizeComposerText, composerMatches, readPromptConfirmDismissed };
