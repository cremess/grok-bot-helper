const { t, setLocale, getLocale, resolveLocale } = require('./lib/i18n');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeTheme, screen, shell, Tray, clipboard, Notification } = require('electron');
const { migrateUserData } = require('./lib/migrate');
const appData = app.getPath('appData');
const userData = path.join(appData, 'grok-bot-helper');
migrateUserData(path.join(appData, 'grokbot-assistant'), userData);
app.setPath('userData', userData);
const { createTrayIcon, appIconPath } = require('./icon');
const { buildPromptLink, parseBotId, isValidBotId, MAX_TEXT_LENGTH, MAX_PARTS, splitMessage } = require('./lib/link');
const { clipSelection, selectionPollDecision, restorePlan } = require('./lib/selection');
const { listBots } = require('./lib/roster');
const { loadHistory, addToHistory, saveHistory } = require('./lib/history');
const { readConversation, recentExchanges, latestReply, replyState, resolveAgentId, trackTranscriptChange,
  waitDecision, NOT_DELIVERED_MS } = require('./lib/transcript');
const { readUsage, isBlocked, formatReset } = require('./lib/usage');
const { avatarColor, avatarInitial } = require('./lib/avatar');
const { loadSettings, saveSettings, isValidShortcut, selectionShortcutError, DEFAULT_SETTINGS, LANGUAGES } = require('./lib/settings');
const { promptPosition, isBoundsVisible } = require('./lib/position');
const { pickShortcut, isFirstRun } = require('./lib/first-run');
const { validateTemplates } = require('./lib/templates');

// Keep the tray icon alive while the app runs.
let tray;
let promptWindow;
let settingsWindow;
let settings;
let registeredShortcut;
let registeredSelectionShortcut;
let capturingSelection = false;
// A long message being sent in parts: { cancelled, part, total }.
let partsJob;
const settingsLocation = {};
const GROK_BOT_DIRECTORY = path.join(app.getPath('appData'), 'Grok Bot', 'sand-client-persistence');
let hideTimer;
let sendingPrompt = false;
let pending;
let responsePoll;
let deliveryFailure;
let failedRequest;
// Keep a reference so Windows doesn't garbage-collect the notification before it's clicked.
let lastNotification;
const historyFile = path.join(app.getPath('userData'), 'history.json');
let history = [];
let pinned = false;
let settingPromptBounds = false;
let userChangingBounds = false;
let boundsSaveTimer;
let autoHeight = 160;

function setPromptBounds(bounds) {
  settingPromptBounds = true;
  try { promptWindow.setBounds(bounds); }
  finally { settingPromptBounds = false; }
}

function positionPrompt() {
  const saved = settings.promptBounds;
  if (isBoundsVisible(saved, screen.getAllDisplays().map((display) => display.workArea))) {
    setPromptBounds(saved);
    return;
  }
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const size = { width: saved?.width || 680, height: saved?.height || autoHeight };
  setPromptBounds({ ...size, ...promptPosition(workArea, size) });
}

function resetPromptBounds() {
  clearTimeout(boundsSaveTimer);
  userChangingBounds = false;
  settings = saveSettings(settingsLocation.path, { ...settings, promptBounds: null });
  positionPrompt();
  promptWindow.webContents.send('prompt:user-sized', false);
  promptWindow.webContents.send('prompt:bounds-reset');
}

function rememberPromptBounds() {
  if (settingPromptBounds || !userChangingBounds) return;
  userChangingBounds = false;
  settings.promptBounds = promptWindow.getBounds();
  clearTimeout(boundsSaveTimer);
  boundsSaveTimer = setTimeout(() => {
    try { settings = saveSettings(settingsLocation.path, settings); }
    catch { /* Keep bounds in memory if saving fails. */ }
    promptWindow.webContents.send('prompt:user-sized', Boolean(settings.promptBounds));
  }, 400);
}

function botDetails() {
  const roster = listBots(GROK_BOT_DIRECTORY);
  const bot = roster.ok ? roster.bots.find((item) => item.id === settings.botId) : undefined;
  const botName = settings.botName || bot?.name || '';
  return { botId: settings.botId, botName,
    botColor: settings.botId ? avatarColor(bot?.color, settings.botId) : '#1080f3',
    botInitial: settings.botId ? avatarInitial(botName) : 'G' };
}

function updateSettingsBackground() {
  if (promptWindow && !promptWindow.isDestroyed()) {
    promptWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1c1c20' : '#fafafc');
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1b1b1f' : '#f6f6f8');
  }
}

function resetDestination() {
  clearTimeout(hideTimer);
  sendingPrompt = false;
  stopWaiting();
  deliveryFailure = undefined;
  clearUnread();
  promptWindow.webContents.send('prompt:conversation', { ...loadConversation(), waiting: false, bot: botDetails() });
}

function conversationFrom(result) {
  return result.ok ? { ok: true, entries: recentExchanges(result.entries, 6), latest: latestReply(result.entries) }
    : { ok: false };
}

function loadConversation() {
  return conversationFrom(readConversation(GROK_BOT_DIRECTORY, settings.botId));
}

// Entry ids present before sending, so only entries written after the send count as the answer.
// The agent is pinned here: with the default bot, Grok Bot's last-used agent could change while we
// wait, and reading another agent's transcript against this baseline would show its old reply.
function conversationBaseline(botId) {
  const agentId = resolveAgentId(GROK_BOT_DIRECTORY, botId) || botId;
  const result = readConversation(GROK_BOT_DIRECTORY, agentId);
  if (result.ok) {
    return { agentId, knownIds: new Set(result.entries.map((entry) => entry.id)),
      knownUntilMs: result.entries.reduce((max, entry) => Math.max(max, entry.timestampMs), 0) };
  }
  return { agentId, knownIds: result.error === 'not-found' ? new Set() : undefined, knownUntilMs: 0 };
}

function sentState(request, entries) {
  return replyState(entries, { knownIds: request.knownIds, knownUntilMs: request.knownUntilMs,
    afterMs: request.sentAt - 2000, expectPrefix: request.expectPrefix });
}

// Reads the baseline for the next part. Right after Grok Bot wrote the previous part the file may be
// caught mid-write; without a baseline, delivery would fall back to timestamps and the previous part's
// entry could pass for this one, so retry a few times.
async function partBaseline(botId) {
  let baseline = conversationBaseline(botId);
  for (let attempt = 0; attempt < 5 && !(baseline.knownIds instanceof Set); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    baseline = conversationBaseline(botId);
  }
  return baseline;
}

// Sends every part in order and returns the outcome. Each part must show up in the transcript before the
// next one goes out, so the parts arrive in order and a failure stops the rest.
async function runParts({ text, parts, links, job }) {
  const botId = settings.botId;
  const mode = settings.afterSend;
  const { total } = job;
  let request;
  try {
    for (let index = 0; index < total; index += 1) {
      if (job.cancelled || settings.botId !== botId) return { ok: false, error: 'cancelled', sentParts: index, total };
      job.part = index + 1;
      promptWindow.webContents.send('prompt:parts-progress', { part: job.part, total });
      const baseline = await partBaseline(botId);
      request = { sentAt: Date.now(), botId, mode, ...baseline, expectPrefix: `(${index + 1}/${total})`,
        sent: { role: 'user', text: parts[index], timestampMs: Date.now() } };
      try {
        await shell.openExternal(links[index].url);
      } catch {
        return { ok: false, error: 'part-failed', part: job.part, total };
      }
      if (index === 0) {
        history = addToHistory(history, text);
        try { saveHistory(historyFile, history); } catch { /* Keep history in memory. */ }
      }
      const delivered = await waitForDelivery(request, job);
      // The part was already handed to Grok Bot; if its confirmation is still open it can still arrive.
      if (job.cancelled) return { ok: false, error: 'cancelled', sentParts: index, total, pendingPart: job.part };
      if (!delivered) return { ok: false, error: 'part-failed', part: job.part, total };
    }
  } finally {
    partsJob = undefined;
  }
  if (request.botId !== settings.botId) return { ok: true, afterSend: mode, total };
  // Every part arrived; wait for the reply to the last one as for a single message.
  request.delivered = true;
  startWaiting(request);
  if (mode === 'hide') {
    clearTimeout(hideTimer);
    sendingPrompt = true;
    hideTimer = setTimeout(() => {
      sendingPrompt = false;
      promptWindow.hide();
    }, 280);
  }
  return { ok: true, afterSend: mode, total };
}

// Polls the transcript until the message of `request` shows up, the job is cancelled or delivery times out.
function waitForDelivery(request, job) {
  return new Promise((resolve) => {
    const check = () => {
      if (job.cancelled) return resolve(false);
      const result = readConversation(GROK_BOT_DIRECTORY, request.agentId);
      if (result.ok && sentState(request, result.entries).delivered) return resolve(true);
      if (Date.now() - request.sentAt >= NOT_DELIVERED_MS) return resolve(false);
      setTimeout(check, 500);
    };
    setTimeout(check, 500);
  });
}

function usageDetails() {
  const usage = readUsage(GROK_BOT_DIRECTORY);
  const now = Date.now();
  return { blocked: isBlocked(usage, now), percentUsed: usage.ok ? usage.percentUsed : null,
    resetText: formatReset(usage.ok ? usage.nextResetMs : null, now) };
}

// Remembers the tooltip's key so a language change can show the same tooltip in the new language.
let trayTooltip = { key: 'app.name', params: {} };
function setTrayTooltip(key, params = {}) {
  trayTooltip = { key, params };
  tray.setToolTip(t(key, params));
}

function clearUnread() {
  tray.setImage(createTrayIcon());
  setTrayTooltip('app.name');
}

function stopWaiting() {
  clearInterval(responsePoll);
  responsePoll = undefined;
  pending = undefined;
  if (promptWindow && !promptWindow.isDestroyed()) promptWindow.setAlwaysOnTop(true);
}

function startWaiting(request) {
  stopWaiting();
  deliveryFailure = undefined;
  pending = request;
  if (pending.mode === 'wait' && !pinned) promptWindow.setAlwaysOnTop(false);
  promptWindow.webContents.send('prompt:conversation', {
    ...loadConversation(), waiting: true, sent: pending.sent,
  });
  responsePoll = setInterval(() => {
    const result = readConversation(GROK_BOT_DIRECTORY, pending.agentId);
    const state = result.ok ? sentState(pending, result.entries) : { delivered: false, reply: null };
    const now = Date.now();
    pending.delivered = pending.delivered || state.delivered;
    // Keep the last reply seen: a read caught while Grok Bot rewrites entries shouldn't lose it.
    if (state.reply) pending.reply = state.reply;
    pending.watch = trackTranscriptChange(pending.watch, result, now);
    const elapsed = now - pending.sentAt;
    const status = waitDecision({ delivered: pending.delivered, hasReply: Boolean(pending.reply),
      elapsedMs: elapsed, quietMs: now - pending.watch.changedAt });
    if (status === 'settling') {
      // Show each new message as it lands, but keep waiting in case the bot sends more.
      const key = state.reply ? `${state.reply.id}\n${state.reply.text}` : pending.replyKey;
      if (result.ok && key !== pending.replyKey) {
        pending.replyKey = key;
        promptWindow.webContents.send('prompt:conversation', {
          ...conversationFrom(result), waiting: true, partial: true, sent: pending.sent,
        });
      }
      return;
    }
    const reply = status === 'replied' ? pending.reply : null;
    const notDelivered = status === 'not-delivered';
    if (status === 'waiting') {
      const awaitingDelivery = !pending.delivered && elapsed >= 15000;
      if (pending.awaitingDelivery !== awaitingDelivery) {
        pending.awaitingDelivery = awaitingDelivery;
        promptWindow.webContents.send('prompt:conversation', {
          ...loadConversation(), waiting: true, sent: pending.sent,
          awaitingDelivery,
        });
      }
      return;
    }
    const request = pending;
    stopWaiting();
    if (notDelivered) {
      deliveryFailure = { notDelivered: true, sent: request.sent };
      failedRequest = request;
    }
    // Reuse the read that found the reply; a second read could catch Grok Bot mid-write.
    promptWindow.webContents.send('prompt:conversation', {
      ...(result.ok ? conversationFrom(result) : loadConversation()), waiting: false, timedOut: !reply && !notDelivered,
      notDelivered, sent: notDelivered ? request.sent : undefined, usage: usageDetails(),
    });
    if (notDelivered && request.mode === 'hide' && !promptWindow.isVisible()) {
      tray.setImage(createTrayIcon({ unread: true }));
      setTrayTooltip('tray.deliveryFailed');
    }
    if (reply && !promptWindow.isVisible()) {
      const roster = listBots(GROK_BOT_DIRECTORY);
      const name = settings.botName || (roster.ok && roster.bots.find((bot) => bot.id === request.agentId)?.name)
        || (settings.botId ? t('bot.fallback', { id: settings.botId.slice(0, 8) }) : t('bot.default'));
      tray.setImage(createTrayIcon({ unread: true }));
      setTrayTooltip('tray.newReply', { name });
      if (settings.notifyOnReply && Notification.isSupported()) {
        const notification = new Notification({ title: name,
          body: [...reply.text.replace(/[*`#]/g, '')].slice(0, 140).join(''),
          silent: false, icon: appIconPath() });
        notification.on('click', () => {
          if (!promptWindow.isVisible()) togglePrompt();
          else { clearUnread(); promptWindow.focus(); }
        });
        lastNotification = notification;
        notification.show();
      }
    }
  }, 1000);
}

function openSettings({ welcome = false } = {}) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    icon: appIconPath(),
    width: 560,
    height: 820,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: t('settings.windowTitle'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1b1f' : '#f6f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWindow.setMenu(null);
  if (welcome) settingsWindow.setSize(560, 920);
  settingsWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWindow.on('closed', () => {
    settingsWindow = undefined;
    applyShortcut(settings.shortcut);
    applySelectionShortcut(settings.selectionShortcut);
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings', 'settings.html'), {
    query: welcome ? { welcome: '1', locale: getLocale() } : { locale: getLocale() },
  });
}

function togglePrompt() {
  if (!promptWindow) return;
  clearTimeout(hideTimer);
  sendingPrompt = false;
  if (promptWindow.isVisible()) {
    promptWindow.hide();
    return;
  }
  showPrompt();
}

function showPrompt(extra = {}) {
  clearTimeout(hideTimer);
  sendingPrompt = false;
  // A slow confirmation in Grok Bot can deliver the message after we gave up waiting;
  // drop the stale failure so "Try again" doesn't send it twice.
  if (deliveryFailure && failedRequest) {
    const result = readConversation(GROK_BOT_DIRECTORY, failedRequest.agentId);
    if (result.ok && sentState(failedRequest, result.entries).delivered) {
      deliveryFailure = undefined;
      failedRequest = undefined;
    }
  }
  positionPrompt();
  clearUnread();
  promptWindow.show();
  promptWindow.focus();
  const roster = listBots(GROK_BOT_DIRECTORY);
  const bot = roster.ok ? roster.bots.find((item) => item.id === settings.botId) : undefined;
  const botName = settings.botName || bot?.name || '';
  promptWindow.webContents.send('prompt:show', {
    history,
    pinned,
    userSized: Boolean(settings.promptBounds),
    botId: settings.botId, botName,
    conversation: loadConversation(), waiting: Boolean(pending), partial: Boolean(pending?.reply), sent: pending?.sent,
    ...deliveryFailure,
    awaitingDelivery: Boolean(pending && !pending.delivered && Date.now() - pending.sentAt >= 15000),
    parts: partsJob ? { part: partsJob.part, total: partsJob.total } : undefined,
    templates: settings.templates,
    usage: usageDetails(),
    botColor: settings.botId ? avatarColor(bot?.color, settings.botId) : '#1080f3',
    botInitial: settings.botId ? avatarInitial(botName) : 'G',
    ...extra,
  });
}

// Simulates Ctrl+C in the focused app with PowerShell and .NET SendKeys, which ship with Windows, so no
// native module or new dependency is needed. The command line is a fixed string: no user text, clipboard
// content or setting is ever put on it. It first waits (up to 1 s) for Ctrl, Shift and Alt from the
// shortcut to be released, otherwise the app would receive Ctrl+Alt+C instead of Ctrl+C.
// In a terminal (cmd, PowerShell, Windows Terminal, mintty) Ctrl+C interrupts the running program, so the
// command checks the focused window's class and exits with code 3 instead of sending the keys.
const TERMINAL_EXIT_CODE = 3;
const COPY_COMMAND = [
  'Add-Type -AssemblyName System.Windows.Forms',
  "Add-Type -Namespace GrokBotHelper -Name Win -MemberDefinition '[DllImport(\"user32.dll\")] public static extern System.IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\", CharSet = CharSet.Unicode)] public static extern int GetClassName(System.IntPtr hWnd, System.Text.StringBuilder name, int max);'",
  '$deadline = [DateTime]::UtcNow.AddMilliseconds(1000)',
  "while ([System.Windows.Forms.Control]::ModifierKeys -ne 'None' -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 20 }",
  '$name = New-Object System.Text.StringBuilder 256',
  '[void][GrokBotHelper.Win]::GetClassName([GrokBotHelper.Win]::GetForegroundWindow(), $name, 256)',
  `if (@('ConsoleWindowClass', 'CASCADIA_HOSTING_WINDOW_CLASS', 'mintty', 'VirtualConsoleClass') -contains $name.ToString()) { exit ${TERMINAL_EXIT_CODE} }`,
  "[System.Windows.Forms.SendKeys]::SendWait('^c')",
].join('; ');

function pressCopy() {
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve, reject) => {
    execFile(powershell, ['-NoProfile', '-NonInteractive', '-Command', COPY_COMMAND],
      { windowsHide: true, timeout: 4000 }, (error) => (error ? reject(error) : resolve()));
  });
}

function snapshotClipboard() {
  const image = clipboard.readImage();
  return { text: clipboard.readText(), html: clipboard.readHTML(), rtf: clipboard.readRTF(),
    image: image.isEmpty() ? null : image, formats: clipboard.availableFormats() };
}

function restoreClipboard(snapshot) {
  const plan = restorePlan(snapshot);
  if (plan.action === 'write') clipboard.write(plan.data);
  else clipboard.clear();
}

async function waitForCopiedText() {
  const startedAt = Date.now();
  for (;;) {
    const text = clipboard.readText();
    const decision = selectionPollDecision({ text, formats: clipboard.availableFormats(),
      elapsedMs: Date.now() - startedAt });
    if (decision === 'text') return text;
    if (decision !== 'wait') return '';
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

// Copies the selection of the focused app and opens the prompt with it. The clipboard is cleared first so
// an unchanged clipboard can't be mistaken for a new copy, and it is always restored afterwards. The copied
// text and the clipboard contents are never logged or saved.
async function sendSelection() {
  if (!promptWindow || capturingSelection) return;
  // With the prompt focused, Ctrl+C would copy from the prompt itself.
  if (promptWindow.isVisible() && promptWindow.isFocused()) return;
  capturingSelection = true;
  let copied = '';
  let snapshot;
  try {
    snapshot = snapshotClipboard();
    clipboard.clear();
    await pressCopy();
    copied = await waitForCopiedText();
  } catch {
    copied = '';
  } finally {
    try { if (snapshot) restoreClipboard(snapshot); } catch { /* Nothing else can be done here. */ }
    capturingSelection = false;
  }
  // A slow app may still answer the Ctrl+C after we gave up and restored; put the clipboard back again.
  if (!copied && snapshot) {
    setTimeout(() => {
      try { if (clipboard.readText() !== snapshot.text) restoreClipboard(snapshot); } catch { /* Ignore. */ }
    }, 400);
  }
  const { text, clipped } = clipSelection(copied, MAX_TEXT_LENGTH);
  showPrompt({ prefill: { text, clipped, empty: !text } });
}

function applySelectionShortcut(accelerator) {
  if (registeredSelectionShortcut) {
    globalShortcut.unregister(registeredSelectionShortcut);
    registeredSelectionShortcut = undefined;
  }
  if (!accelerator) return true;
  try {
    if (globalShortcut.register(accelerator, () => { sendSelection(); })) {
      registeredSelectionShortcut = accelerator;
      return true;
    }
  } catch {
    // Also warn when Electron rejects the accelerator.
  }
  tray.displayBalloon({
    title: t('app.name'),
    content: t('balloon.shortcutUnavailable', { shortcut: accelerator }),
  });
  return false;
}

function buildTrayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t('tray.openPrompt'), click: () => {
      if (promptWindow && !promptWindow.isVisible()) togglePrompt();
    } },
    { label: t('tray.settings'), click: () => openSettings() },
    { label: t('tray.resetPosition'), click: resetPromptBounds },
    { type: 'separator' },
    { label: t('tray.quit'), click: () => app.quit() },
  ]));
}

function loadPrompt() {
  return promptWindow.loadFile(path.join(__dirname, 'prompt', 'prompt.html'), { query: { locale: getLocale() } });
}

// Main and renderers share one locale: main switches here, then the windows reload with it in the query.
function applyLanguage() {
  const previous = getLocale();
  const locale = setLocale(resolveLocale(settings.language, app.getLocale()));
  if (locale === previous) return false;
  buildTrayMenu();
  setTrayTooltip(trayTooltip.key, trayTooltip.params);
  // A visible prompt would sit empty after the reload, so fill it again.
  loadPrompt().then(() => { if (promptWindow.isVisible()) showPrompt(); }).catch(() => {});
  return true;
}

function applyShortcut(accelerator) {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut);
    registeredShortcut = undefined;
  }

  try {
    if (globalShortcut.register(accelerator, togglePrompt)) {
      registeredShortcut = accelerator;
      return true;
    }
  } catch {
    // Also warn when Electron rejects the accelerator.
  }

  tray.displayBalloon({
    title: t('app.name'),
    content: t('balloon.shortcutUnavailable', { shortcut: accelerator }),
  });
  return false;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    app.setAppUserModelId('app.grokbothelper.desktop');
    Object.assign(settingsLocation, { path: path.join(app.getPath('userData'), 'settings.json') });
    Object.freeze(settingsLocation);
    const firstRun = isFirstRun(fs.existsSync(settingsLocation.path));
    settings = loadSettings(settingsLocation.path);
    setLocale(resolveLocale(settings.language, app.getLocale()));
    history = loadHistory(historyFile);
    nativeTheme.themeSource = settings.theme;
    nativeTheme.on('updated', updateSettingsBackground);
    tray = new Tray(createTrayIcon());
    setTrayTooltip('app.name');
    buildTrayMenu();
    tray.on('click', () => {
      if (promptWindow && !promptWindow.isVisible()) togglePrompt();
    });

    ipcMain.handle('settings:get', () => ({
      ...settings,
      defaultShortcut: DEFAULT_SETTINGS.shortcut,
    }));
    const botsWithAvatars = () => {
      const result = listBots(GROK_BOT_DIRECTORY);
      if (!result.ok) return result;
      return { ok: true, bots: result.bots.map((bot) => ({
        ...bot, avatar: { color: avatarColor(bot.color, bot.id), initial: avatarInitial(bot.name) },
      })) };
    };
    ipcMain.handle('settings:bots', botsWithAvatars);
    ipcMain.handle('prompt:bots', botsWithAvatars);
    ipcMain.handle('settings:recording', (_event, isRecording) => {
      if (isRecording === true) {
        if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
        registeredShortcut = undefined;
        applySelectionShortcut('');
      } else if (isRecording === false) {
        applyShortcut(settings.shortcut);
        applySelectionShortcut(settings.selectionShortcut);
      }
    });
    ipcMain.handle('settings:save', (_event, payload) => {
      let botId = '';
      let botName = '';
      if (payload?.mode === 'list' && isValidBotId(payload.botId)) {
        botId = payload.botId;
        botName = typeof payload.botName === 'string' ? payload.botName.trim().slice(0, 80) : '';
      } else if (payload?.mode === 'manual') {
        botId = parseBotId(payload.botInput);
        if (botId === null) return { ok: false, error: 'invalid-bot' };
      } else if (payload?.mode !== 'default') {
        return { ok: false, error: 'invalid-bot' };
      }
      const { shortcut, selectionShortcut, launchAtLogin, afterSend, notifyOnReply, theme, language } = payload;
      if (typeof notifyOnReply !== 'boolean' || !['system', 'dark', 'light'].includes(theme)) {
        return { ok: false, error: 'invalid-option' };
      }
      if (afterSend !== 'wait' && afterSend !== 'hide') return { ok: false, error: 'invalid-after-send' };
      if (!LANGUAGES.includes(language)) return { ok: false, error: 'invalid-language' };
      const templates = validateTemplates(payload.templates);
      if (!templates.ok) return { ok: false, error: 'invalid-templates' };
      if (!isValidShortcut(shortcut)) return { ok: false, error: 'invalid-shortcut' };
      const selectionError = typeof selectionShortcut === 'string'
        ? selectionShortcutError(selectionShortcut, shortcut) : 'invalid';
      if (selectionError === 'conflict') return { ok: false, error: 'selection-shortcut-conflict' };
      if (selectionError) return { ok: false, error: 'invalid-selection-shortcut' };
      const previousSettings = settings;
      const selectionChanged = selectionShortcut !== settings.selectionShortcut;
      // Free the old selection shortcut first so the two shortcuts can swap keys in one save.
      if (selectionChanged) applySelectionShortcut('');
      if (shortcut !== settings.shortcut && !applyShortcut(shortcut)) {
        applyShortcut(settings.shortcut);
        if (selectionChanged) applySelectionShortcut(settings.selectionShortcut);
        return { ok: false, error: 'shortcut-taken' };
      }
      if (selectionChanged && !applySelectionShortcut(selectionShortcut)) {
        // Give the prompt shortcut its keys back first: the old selection shortcut may use them.
        if (shortcut !== settings.shortcut) applyShortcut(settings.shortcut);
        applySelectionShortcut(settings.selectionShortcut);
        return { ok: false, error: 'selection-shortcut-taken' };
      }
      try {
        app.setLoginItemSettings({
          openAtLogin: Boolean(launchAtLogin),
          ...(!app.isPackaged ? { path: process.execPath, args: [app.getAppPath()] } : {}),
        });
        settings = saveSettings(settingsLocation.path, {
          ...settings,
          botId, botName, shortcut, selectionShortcut, launchAtLogin: Boolean(launchAtLogin), afterSend,
          notifyOnReply, theme, language, templates: templates.templates,
        });
        nativeTheme.themeSource = settings.theme;
        updateSettingsBackground();
        const localeChanged = applyLanguage();
        if (botId !== previousSettings.botId) {
          resetDestination();
        }
        return { ok: true, settings, localeChanged };
      } catch {
        if (shortcut !== previousSettings.shortcut) applyShortcut(previousSettings.shortcut);
        if (selectionChanged) applySelectionShortcut(previousSettings.selectionShortcut);
        return { ok: false, error: 'unexpected' };
      }
    });

    // Reloads the settings window in the new language after a change (keeps welcome mode out of it).
    ipcMain.handle('settings:reload', () => {
      if (!settingsWindow || settingsWindow.isDestroyed()) return;
      settingsWindow.setTitle(t('settings.windowTitle'));
      settingsWindow.loadFile(path.join(__dirname, 'settings', 'settings.html'), { query: { locale: getLocale() } })
        .catch(() => {});
    });
    ipcMain.handle('settings:clear-history', () => {
      try {
        saveHistory(historyFile, []);
        history = [];
        return { ok: true };
      } catch { return { ok: false, error: 'unexpected' }; }
    });
    ipcMain.handle('prompt:select-bot', (_event, payload) => {
      if (payload?.botId !== '' && !isValidBotId(payload?.botId)) return { ok: false, error: 'invalid-bot' };
      try {
        settings = saveSettings(settingsLocation.path, { ...settings, botId: payload.botId,
          botName: typeof payload.botName === 'string' ? payload.botName.trim().slice(0, 80) : '' });
        resetDestination();
        return { ok: true, conversation: loadConversation(), bot: botDetails() };
      } catch { return { ok: false, error: 'unexpected' }; }
    });
    ipcMain.handle('prompt:copy', (_event, text) => {
      if (typeof text !== 'string') return { ok: false };
      clipboard.writeText(text.slice(0, 20000));
      return { ok: true };
    });
    ipcMain.handle('prompt:open-bot', async () => {
      const result = readConversation(GROK_BOT_DIRECTORY, settings.botId);
      const url = result.ok && isValidBotId(result.agentId)
        ? `grokbot://app/v1/agent?id=${encodeURIComponent(result.agentId)}` : 'grokbot://app/v1/open';
      try {
        await shell.openExternal(url);
        promptWindow.hide();
        return { ok: true };
      } catch { return { ok: false, error: 'open-failed' }; }
    });

    promptWindow = new BrowserWindow({
      icon: appIconPath(),
      width: 680,
      height: 160,
      frame: false,
      thickFrame: true,
      resizable: true,
      movable: true,
      roundedCorners: true,
      minWidth: 460,
      minHeight: 160,
      maxWidth: 1400,
      maxHeight: 1200,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c20' : '#fafafc',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    promptWindow.webContents.on('will-navigate', (event) => event.preventDefault());
    promptWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    promptWindow.on('blur', () => {
      if (!pinned && !sendingPrompt && !partsJob && pending?.mode !== 'wait') promptWindow.hide();
    });
    // Windows emits will-move/will-resize only for manual changes.
    for (const event of ['will-move', 'will-resize']) {
      promptWindow.on(event, () => {
        if (!settingPromptBounds) userChangingBounds = true;
      });
    }
    promptWindow.on('moved', rememberPromptBounds);
    promptWindow.on('resized', rememberPromptBounds);
    // The drag region receives a native double-click without a DOM event.
    if (process.platform === 'win32') {
      promptWindow.hookWindowMessage(0x00A3, (hitTest) => {
        if (hitTest.readUInt32LE(0) === 2) resetPromptBounds();
      });
    }
    ipcMain.handle('prompt:set-pinned', (_event, value) => {
      if (typeof value !== 'boolean') return;
      pinned = value;
      promptWindow.setAlwaysOnTop(pinned || pending?.mode !== 'wait');
    });
    ipcMain.handle('prompt:reset-bounds', resetPromptBounds);
    ipcMain.handle('prompt:resize', (_event, height) => {
      if (typeof height !== 'number' || !Number.isFinite(height)) return;
      autoHeight = Math.max(128, Math.min(600, Math.ceil(height)));
      if (settings.promptBounds?.height || userChangingBounds) return;
      const bounds = promptWindow.getBounds();
      if (bounds.height !== Math.max(160, autoHeight)) setPromptBounds({ ...bounds, height: autoHeight });
    });

    ipcMain.handle('prompt:open-link', (_event, url) => {
      if (typeof url !== 'string') return;
      try {
        const protocol = new URL(url).protocol;
        if (protocol === 'http:' || protocol === 'https:') return shell.openExternal(url).catch(() => {});
      } catch { /* Ignore invalid URLs. */ }
    });

    ipcMain.handle('prompt:stop-waiting', () => {
      stopWaiting();
      const conversation = { ...loadConversation(), waiting: false };
      promptWindow.webContents.send('prompt:conversation', conversation);
      return conversation;
    });
    ipcMain.handle('prompt:submit', async (_event, payload) => {
      const text = typeof payload === 'string' ? payload : payload?.text;
      if (partsJob) return { ok: false, error: 'busy' };
      const result = buildPromptLink({ text, botId: settings.botId });
      if (result.error === 'too-long') {
        // Tell the prompt how many parts it would take so it can offer to split it.
        return { ...result, parts: [...text].length <= MAX_PARTS * MAX_TEXT_LENGTH * 2 ? splitMessage(text).length : Infinity,
          maxParts: MAX_PARTS };
      }
      if (!result.ok) return result;
      const usage = usageDetails();
      if (usage.blocked && payload?.force !== true) {
        return { ok: false, error: 'limit', resetText: usage.resetText, percentUsed: usage.percentUsed };
      }
      if (!result.url.startsWith('grokbot://app/v1/prompt?')) {
        return { ok: false, error: 'open-failed' };
      }

      const request = { sentAt: Date.now(), botId: settings.botId, mode: settings.afterSend,
        ...conversationBaseline(settings.botId),
        sent: { role: 'user', text: text.trim(), timestampMs: Date.now() } };
      try {
        sendingPrompt = true;
        await shell.openExternal(result.url);
        history = addToHistory(history, text);
        try { saveHistory(historyFile, history); } catch { /* Sending already succeeded; keep history in memory. */ }
        clearTimeout(hideTimer);
        sendingPrompt = false;
        if (request.botId !== settings.botId) return { ok: true, afterSend: request.mode };
        startWaiting(request);
        if (request.mode === 'hide') {
          sendingPrompt = true;
          hideTimer = setTimeout(() => {
            sendingPrompt = false;
            promptWindow.hide();
          }, 280);
        }
        return { ok: true, afterSend: request.mode };
      } catch {
        sendingPrompt = false;
        return { ok: false, error: 'open-failed' };
      }
    });
    // Sends a long message as numbered parts, one at a time (see runParts). The user confirms this in the
    // prompt first; nothing is split without that click. Checks that fail before anything is sent are
    // returned directly; once sending starts, the outcome also goes out as a 'prompt:parts-progress' event,
    // so a prompt that was hidden, reopened or reloaded meanwhile still learns how it ended.
    ipcMain.handle('prompt:submit-parts', async (_event, payload) => {
      if (partsJob || sendingPrompt) return { ok: false, error: 'busy' };
      const text = payload?.text;
      if (typeof text !== 'string' || (payload.force !== undefined && typeof payload.force !== 'boolean')) {
        return { ok: false, error: 'empty' };
      }
      if ([...text].length > MAX_PARTS * MAX_TEXT_LENGTH * 2) return { ok: false, error: 'too-many-parts', maxParts: MAX_PARTS };
      const parts = splitMessage(text);
      if (!parts.length) return { ok: false, error: 'empty' };
      if (parts.length > MAX_PARTS) return { ok: false, error: 'too-many-parts', maxParts: MAX_PARTS };
      const links = parts.map((part) => buildPromptLink({ text: part, botId: settings.botId }));
      const invalid = links.find((link) => !link.ok);
      if (invalid) return invalid;
      if (links.some((link) => !link.url.startsWith('grokbot://app/v1/prompt?'))) return { ok: false, error: 'open-failed' };
      const usage = usageDetails();
      if (usage.blocked && payload.force !== true) {
        return { ok: false, error: 'limit', resetText: usage.resetText, percentUsed: usage.percentUsed };
      }

      const job = { cancelled: false, part: 0, total: parts.length };
      partsJob = job;
      // A reply wait from an earlier message would read the same transcript; this send takes over.
      stopWaiting();
      deliveryFailure = undefined;
      let result;
      try {
        result = await runParts({ text, parts, links, job });
      } catch {
        partsJob = undefined;
        result = { ok: false, error: 'unexpected' };
      }
      promptWindow.webContents.send('prompt:parts-progress', { done: true, result });
      return { ...result, finished: true };
    });
    ipcMain.handle('prompt:cancel-parts', () => {
      if (partsJob) partsJob.cancelled = true;
      return { ok: true };
    });
    ipcMain.handle('prompt:hide', () => promptWindow.hide());
    ipcMain.handle('prompt:open-settings', () => {
      promptWindow.hide();
      openSettings();
    });

    await loadPrompt();
    if (firstRun) {
      const chosen = pickShortcut(settings.shortcut, (accelerator) => {
        try {
          return globalShortcut.register(accelerator, togglePrompt);
        } catch {
          return false;
        } finally {
          // Registrations are temporary; applyShortcut keeps only the chosen shortcut.
          globalShortcut.unregister(accelerator);
        }
      });
      if (chosen.changed) settings.shortcut = chosen.shortcut;
      applyShortcut(settings.shortcut);
      applySelectionShortcut(settings.selectionShortcut);
      if (app.isPackaged) {
        app.setLoginItemSettings({ openAtLogin: true });
        settings.launchAtLogin = true;
      }
      try {
        settings = saveSettings(settingsLocation.path, settings);
      } catch {
        // An antivirus can lock the file for a moment; still show the welcome screen, which saves again.
      }
      openSettings({ welcome: true });
      tray.displayBalloon({
        title: t('balloon.ready.title'),
        content: t('balloon.ready.body', { shortcut: settings.shortcut }),
      });
      return;
    }
    // Keep startup registration pointing to the installed executable.
    if (app.isPackaged && settings.launchAtLogin) app.setLoginItemSettings({ openAtLogin: true });
    applyShortcut(settings.shortcut);
    applySelectionShortcut(settings.selectionShortcut);
  });

  app.on('second-instance', () => {
    if (promptWindow && !promptWindow.isVisible()) togglePrompt();
  });

  app.on('will-quit', () => {
    if (boundsSaveTimer) {
      clearTimeout(boundsSaveTimer);
      try { saveSettings(settingsLocation.path, settings); } catch { /* The app is shutting down. */ }
    }
    clearTimeout(hideTimer);
    stopWaiting();
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    // Keep running in the tray with no open windows.
  });
}
