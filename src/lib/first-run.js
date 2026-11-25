const FALLBACK_SHORTCUTS = Object.freeze([
  'Ctrl+Space', 'Ctrl+Shift+Space', 'Alt+Shift+G', 'Ctrl+Alt+G',
]);

function pickShortcut(preferred, tryRegister) {
  for (const shortcut of new Set([preferred, ...FALLBACK_SHORTCUTS])) {
    if (tryRegister(shortcut)) return { shortcut, changed: shortcut !== preferred };
  }
  return { shortcut: preferred, changed: false, failed: true };
}

function isFirstRun(settingsFileExists) {
  return !settingsFileExists;
}

module.exports = { FALLBACK_SHORTCUTS, pickShortcut, isFirstRun };
