const fs = require('node:fs');
const path = require('node:path');
const { isValidBotId } = require('./link');
const { normalizeTemplates } = require('./templates');
const { isAssistant, isValidReplyTimeout, DEFAULT_REPLY_TIMEOUT_MINUTES } = require('./assistant');
const { isValidAgentId } = require('./openbot-client');
const { isHermesPathFormat, isValidHermesName } = require('./hermes-client');

const DEFAULT_SETTINGS = Object.freeze({
  botId: '',
  botName: '',
  shortcut: 'Alt+Space',
  // Empty means off: the "send selected text" shortcut is opt-in so it never takes keys by surprise.
  selectionShortcut: '',
  launchAtLogin: false,
  autoSend: true,
  afterSend: 'wait',
  notifyOnReply: false,
  theme: 'system',
  // 'system' follows the Windows language; 'en' and 'pt-BR' pick one.
  language: 'system',
  promptBounds: null,
  templates: Object.freeze([]),
  autoUpdate: true,
  lastUpdateCheckMs: 0,
  // Where messages go: 'grokbot' (deep links, the default), 'openbot' (local API) or 'hermes' (local CLI).
  assistant: 'grokbot',
  openbotAgentId: '',
  openbotAgentName: '',
  // Empty means the default location, %LOCALAPPDATA%\hermes\bin\hermes.exe.
  hermesPath: '',
  // Empty means Hermes's own default.
  hermesModel: '',
  hermesProvider: '',
  hermesContinue: true,
  // How long the prompt waits for an OpenBot or Hermes reply.
  replyTimeoutMinutes: DEFAULT_REPLY_TIMEOUT_MINUTES,
});

const LANGUAGES = ['system', 'en', 'pt-BR'];

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

const CANONICAL_MODIFIERS = {
  Control: 'Ctrl', Ctrl: 'Ctrl', CommandOrControl: 'Ctrl', CmdOrCtrl: 'Ctrl',
  Alt: 'Alt', Shift: 'Shift', Super: 'Super',
};
const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Super'];

// Writes a valid shortcut in one spelling (on Windows, Control and CommandOrControl are both Ctrl)
// so two shortcuts can be compared.
function canonicalShortcut(value) {
  if (!isValidShortcut(value)) return null;
  const parts = value.split('+');
  const key = parts.pop();
  const modifiers = new Set(parts.map((part) => CANONICAL_MODIFIERS[part]));
  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key].join('+');
}

function sameShortcut(a, b) {
  const first = canonicalShortcut(a);
  return first !== null && first === canonicalShortcut(b);
}

// The app simulates Ctrl+C right after this shortcut fires, so it must not be a copy shortcut itself,
// must not use Super (Windows would read Super+Ctrl+C as a system shortcut while the key is still held)
// and needs Ctrl or Alt so it doesn't take a plain key or Shift+letter away from typing.
// Returns null when the value is usable, 'invalid' or 'conflict' (same as the prompt shortcut).
function selectionShortcutError(value, mainShortcut) {
  if (value === '') return null;
  const canonical = canonicalShortcut(value);
  if (canonical === null) return 'invalid';
  const modifiers = canonical.split('+').slice(0, -1);
  if (modifiers.includes('Super') || !(modifiers.includes('Ctrl') || modifiers.includes('Alt'))
      || canonical === 'Ctrl+C' || canonical === 'Ctrl+Insert') return 'invalid';
  if (sameShortcut(value, mainShortcut)) return 'conflict';
  return null;
}

function normalizeSettings(raw) {
  const settings = { ...DEFAULT_SETTINGS, templates: [] };
  if (raw === null || typeof raw !== 'object') return settings;

  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) return settings;

  if (raw.botId === '' || isValidBotId(raw.botId)) settings.botId = raw.botId;
  if (settings.botId && typeof raw.botName === 'string' && raw.botName.trim().length <= 80) {
    settings.botName = raw.botName.trim();
  }
  if (isValidShortcut(raw.shortcut)) settings.shortcut = raw.shortcut;
  if (typeof raw.selectionShortcut === 'string' && selectionShortcutError(raw.selectionShortcut, settings.shortcut) === null) {
    settings.selectionShortcut = raw.selectionShortcut;
  }
  if (typeof raw.launchAtLogin === 'boolean') settings.launchAtLogin = raw.launchAtLogin;
  if (typeof raw.autoSend === 'boolean') settings.autoSend = raw.autoSend;
  if (raw.afterSend === 'wait' || raw.afterSend === 'hide') settings.afterSend = raw.afterSend;
  if (typeof raw.notifyOnReply === 'boolean') settings.notifyOnReply = raw.notifyOnReply;
  if (['system', 'dark', 'light'].includes(raw.theme)) settings.theme = raw.theme;
  // Settings saved before the language option existed keep the English interface the user already had;
  // only a fresh install (no settings file) starts on 'system'.
  settings.language = LANGUAGES.includes(raw.language) ? raw.language : 'en';
  const bounds = raw.promptBounds;
  if (bounds && !Array.isArray(bounds)
      && ['x', 'y', 'width', 'height'].every((key) => Number.isInteger(bounds[key]))
      && bounds.width >= 460 && bounds.width <= 1400
      && bounds.height >= 160 && bounds.height <= 1200) {
    const { x, y, width, height } = bounds;
    settings.promptBounds = { x, y, width, height };
  }
  settings.templates = normalizeTemplates(raw.templates);
  if (typeof raw.autoUpdate === 'boolean') settings.autoUpdate = raw.autoUpdate;
  if (Number.isFinite(raw.lastUpdateCheckMs) && raw.lastUpdateCheckMs >= 0) settings.lastUpdateCheckMs = raw.lastUpdateCheckMs;
  if (isAssistant(raw.assistant)) settings.assistant = raw.assistant;
  if (raw.openbotAgentId === '' || isValidAgentId(raw.openbotAgentId)) settings.openbotAgentId = raw.openbotAgentId;
  if (settings.openbotAgentId && typeof raw.openbotAgentName === 'string' && raw.openbotAgentName.trim().length <= 80) {
    settings.openbotAgentName = raw.openbotAgentName.trim();
  }
  if (raw.hermesPath === '' || isHermesPathFormat(raw.hermesPath)) settings.hermesPath = raw.hermesPath;
  if (isValidHermesName(raw.hermesModel)) settings.hermesModel = raw.hermesModel;
  if (isValidHermesName(raw.hermesProvider)) settings.hermesProvider = raw.hermesProvider;
  if (typeof raw.hermesContinue === 'boolean') settings.hermesContinue = raw.hermesContinue;
  if (isValidReplyTimeout(raw.replyTimeoutMinutes)) settings.replyTimeoutMinutes = raw.replyTimeoutMinutes;
  return settings;
}

function loadSettings(filePath) {
  try {
    // Remove the BOM that editors such as Notepad may add.
    return normalizeSettings(JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '')));
  } catch {
    return normalizeSettings(null);
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
  LANGUAGES,
  isValidShortcut,
  canonicalShortcut,
  sameShortcut,
  selectionShortcutError,
  normalizeSettings,
  loadSettings,
  saveSettings,
};
