const fs = require('node:fs');
const path = require('node:path');
const { isValidBotId } = require('./link');

const DEFAULT_SETTINGS = Object.freeze({
  botId: '',
  botName: '',
  shortcut: 'Alt+Space',
  launchAtLogin: false,
  afterSend: 'wait',
  notifyOnReply: false,
  theme: 'system',
  promptBounds: null,
});

const MODIFIERS = new Set([
  'Alt', 'Shift', 'Control', 'Ctrl', 'CommandOrControl', 'CmdOrCtrl', 'Super',
]);
const NAMED_KEYS = new Set([
  'Space', 'Tab', 'Enter', 'Backspace', 'Delete', 'Insert', 'Home', 'End',
  'PageUp', 'PageDown', 'Up', 'Down', 'Left', 'Right',
]);
const SYMBOL_KEYS = new Set([ '`', '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/' ]);

function isValidShortcut(value) {
  if (typeof value !== 'string' || /\s/.test(value)) return false;

  const parts = value.split('+');
  if (parts.length < 2) return false;

  const key = parts.pop();
  const validKey = /^[A-Z0-9]$/.test(key)
    || /^F([1-9]|1[0-9]|2[0-4])$/.test(key)
    || NAMED_KEYS.has(key) || SYMBOL_KEYS.has(key);

  return validKey && parts.every((part) => MODIFIERS.has(part))
    && new Set(parts).size === parts.length;
}

function normalizeSettings(raw) {
  const settings = { ...DEFAULT_SETTINGS };
  if (raw === null || typeof raw !== 'object') return settings;

  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) return settings;

  if (raw.botId === '' || isValidBotId(raw.botId)) settings.botId = raw.botId;
  if (settings.botId && typeof raw.botName === 'string' && raw.botName.trim().length <= 80) {
    settings.botName = raw.botName.trim();
  }
  if (isValidShortcut(raw.shortcut)) settings.shortcut = raw.shortcut;
  if (typeof raw.launchAtLogin === 'boolean') settings.launchAtLogin = raw.launchAtLogin;
  if (raw.afterSend === 'wait' || raw.afterSend === 'hide') settings.afterSend = raw.afterSend;
  if (typeof raw.notifyOnReply === 'boolean') settings.notifyOnReply = raw.notifyOnReply;
  if (['system', 'dark', 'light'].includes(raw.theme)) settings.theme = raw.theme;
  const bounds = raw.promptBounds;
  if (bounds && !Array.isArray(bounds)
      && ['x', 'y', 'width', 'height'].every((key) => Number.isInteger(bounds[key]))
      && bounds.width >= 460 && bounds.width <= 1400
      && bounds.height >= 160 && bounds.height <= 1200) {
    const { x, y, width, height } = bounds;
    settings.promptBounds = { x, y, width, height };
  }
  return settings;
}

function loadSettings(filePath) {
  try {
    // Remove o BOM que editores como o Bloco de Notas podem adicionar.
    return normalizeSettings(JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '')));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(filePath, settings) {
  const normalized = normalizeSettings(settings);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(`${filePath}.tmp`, JSON.stringify(normalized, null, 2), 'utf8');
  fs.renameSync(`${filePath}.tmp`, filePath);
  return normalized;
}

module.exports = {
  DEFAULT_SETTINGS,
  isValidShortcut,
  normalizeSettings,
  loadSettings,
  saveSettings,
};
