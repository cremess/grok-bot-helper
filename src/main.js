const { t } = require('./lib/i18n');
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeTheme, screen, shell, Tray, clipboard, Notification } = require('electron');
const { migrateUserData } = require('./lib/migrate');
const appData = app.getPath('appData');
const userData = path.join(appData, 'grok-bot-helper');
migrateUserData(path.join(appData, 'grokbot-assistant'), userData);
app.setPath('userData', userData);
const { createTrayIcon, appIconPath } = require('./icon');
const { buildPromptLink, parseBotId, isValidBotId } = require('./lib/link');
const { listBots } = require('./lib/roster');
const { loadHistory, addToHistory, saveHistory } = require('./lib/history');
const { readConversation, recentExchanges, latestReply, replyState, resolveAgentId, trackTranscriptChange,
  waitDecision } = require('./lib/transcript');
const { readUsage, isBlocked, formatReset } = require('./lib/usage');
const { avatarColor, avatarInitial } = require('./lib/avatar');
const { loadSettings, saveSettings, isValidShortcut, DEFAULT_SETTINGS } = require('./lib/settings');
const { promptPosition, isBoundsVisible } = require('./lib/position');
const { pickShortcut, isFirstRun } = require('./lib/first-run');

// Keep the tray icon alive while the app runs.
let tray;
let promptWindow;
let settingsWindow;
let settings;
let registeredShortcut;
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
    afterMs: request.sentAt - 2000 });
}

function usageDetails() {
  const usage = readUsage(GROK_BOT_DIRECTORY);
  const now = Date.now();
  return { blocked: isBlocked(usage, now), percentUsed: usage.ok ? usage.percentUsed : null,
    resetText: formatReset(usage.ok ? usage.nextResetMs : null, now) };
}

function clearUnread() {
  tray.setImage(createTrayIcon());
  tray.setToolTip(t('app.name'));
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
      tray.setToolTip(t('tray.deliveryFailed'));
    }
    if (reply && !promptWindow.isVisible()) {
      const roster = listBots(GROK_BOT_DIRECTORY);
      const name = settings.botName || (roster.ok && roster.bots.find((bot) => bot.id === request.agentId)?.name)
        || (settings.botId ? t('bot.fallback', { id: settings.botId.slice(0, 8) }) : t('bot.default'));
      tray.setImage(createTrayIcon({ unread: true }));
      tray.setToolTip(t('tray.newReply', { name }));
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
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings', 'settings.html'), {
    query: welcome ? { welcome: '1' } : {},
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
    usage: usageDetails(),
    botColor: settings.botId ? avatarColor(bot?.color, settings.botId) : '#1080f3',
    botInitial: settings.botId ? avatarInitial(botName) : 'G',
  });
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
    history = loadHistory(historyFile);
    nativeTheme.themeSource = settings.theme;
    nativeTheme.on('updated', updateSettingsBackground);
    tray = new Tray(createTrayIcon());
    tray.setToolTip(t('app.name'));
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: t('tray.openPrompt'), click: () => {
        if (promptWindow && !promptWindow.isVisible()) togglePrompt();
      } },
      { label: t('tray.settings'), click: () => openSettings() },
      { label: t('tray.resetPosition'), click: resetPromptBounds },
      { type: 'separator' },
      { label: t('tray.quit'), click: () => app.quit() },
    ]));
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
      } else if (isRecording === false) {
        applyShortcut(settings.shortcut);
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
      const { shortcut, launchAtLogin, afterSend, notifyOnReply, theme } = payload;
      if (typeof notifyOnReply !== 'boolean' || !['system', 'dark', 'light'].includes(theme)) {
        return { ok: false, error: 'invalid-option' };
      }
      if (afterSend !== 'wait' && afterSend !== 'hide') return { ok: false, error: 'invalid-after-send' };
      if (!isValidShortcut(shortcut)) return { ok: false, error: 'invalid-shortcut' };
      const previousSettings = settings;
      if (shortcut !== settings.shortcut && !applyShortcut(shortcut)) {
        applyShortcut(settings.shortcut);
        return { ok: false, error: 'shortcut-taken' };
      }
      try {
        app.setLoginItemSettings({
          openAtLogin: Boolean(launchAtLogin),
          ...(!app.isPackaged ? { path: process.execPath, args: [app.getAppPath()] } : {}),
        });
        settings = saveSettings(settingsLocation.path, {
          ...settings,
          botId, botName, shortcut, launchAtLogin: Boolean(launchAtLogin), afterSend, notifyOnReply, theme,
        });
        nativeTheme.themeSource = settings.theme;
        updateSettingsBackground();
        if (botId !== previousSettings.botId) {
          resetDestination();
        }
        return { ok: true, settings };
      } catch {
        if (shortcut !== previousSettings.shortcut) applyShortcut(previousSettings.shortcut);
        return { ok: false, error: 'unexpected' };
      }
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
      if (!pinned && !sendingPrompt && pending?.mode !== 'wait') promptWindow.hide();
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
      const result = buildPromptLink({ text, botId: settings.botId });
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
    ipcMain.handle('prompt:hide', () => promptWindow.hide());
    ipcMain.handle('prompt:open-settings', () => {
      promptWindow.hide();
      openSettings();
    });

    await promptWindow.loadFile(path.join(__dirname, 'prompt', 'prompt.html'));
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
