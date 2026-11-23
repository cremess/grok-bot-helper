const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeTheme, screen, shell, Tray, clipboard, Notification } = require('electron');
app.setPath('userData', path.join(app.getPath('appData'), 'grokbot-assistant'));
const { createTrayIcon, appIconPath } = require('./icon');
const { buildPromptLink, parseBotId, isValidBotId } = require('./lib/link');
const { listBots } = require('./lib/roster');
const { loadHistory, addToHistory, saveHistory } = require('./lib/history');
const { readConversation, recentExchanges, latestReply } = require('./lib/transcript');
const { avatarColor, avatarInitial } = require('./lib/avatar');
const { loadSettings, saveSettings, isValidShortcut, DEFAULT_SETTINGS } = require('./lib/settings');
const { promptPosition } = require('./lib/position');
const { pickShortcut, isFirstRun } = require('./lib/first-run');

// Mantém o ícone vivo durante a execução do app.
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
const historyFile = path.join(app.getPath('userData'), 'history.json');
let history = [];

function botDetails() {
  const roster = listBots(GROK_BOT_DIRECTORY);
  const bot = roster.ok ? roster.bots.find((item) => item.id === settings.botId) : undefined;
  const botName = settings.botName || bot?.name || '';
  return { botId: settings.botId, botName,
    botColor: settings.botId ? avatarColor(bot?.color, settings.botId) : '#1080f3',
    botInitial: settings.botId ? avatarInitial(botName) : 'G' };
}

function updateSettingsBackground() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1b1b1f' : '#f6f6f8');
  }
}

function resetDestination() {
  clearTimeout(hideTimer);
  sendingPrompt = false;
  stopWaiting();
  clearUnread();
  promptWindow.webContents.send('prompt:conversation', { ...loadConversation(), waiting: false, bot: botDetails() });
}

function loadConversation() {
  const result = readConversation(GROK_BOT_DIRECTORY, settings.botId);
  return result.ok ? { ok: true, entries: recentExchanges(result.entries, 6), latest: latestReply(result.entries) }
    : { ok: false };
}

function clearUnread() {
  tray.setImage(createTrayIcon());
  tray.setToolTip('GrokBot Assistant');
}

function stopWaiting() {
  clearInterval(responsePoll);
  responsePoll = undefined;
  pending = undefined;
  if (promptWindow && !promptWindow.isDestroyed()) promptWindow.setAlwaysOnTop(true);
}

function startWaiting(request) {
  stopWaiting();
  pending = request;
  if (pending.mode === 'wait') promptWindow.setAlwaysOnTop(false);
  promptWindow.webContents.send('prompt:conversation', {
    ...loadConversation(), waiting: true, sent: pending.sent,
  });
  responsePoll = setInterval(() => {
    const result = readConversation(GROK_BOT_DIRECTORY, pending.botId);
    const reply = result.ok && latestReply(result.entries, { afterMs: pending.sentAt - 2000 });
    const timedOut = Date.now() - pending.sentAt >= 10 * 60 * 1000;
    if (!reply && !timedOut) return;
    stopWaiting();
    promptWindow.webContents.send('prompt:conversation', {
      ...loadConversation(), waiting: false, timedOut: !reply,
    });
    if (reply && !promptWindow.isVisible()) {
      const roster = listBots(GROK_BOT_DIRECTORY);
      const name = settings.botName || (roster.ok && roster.bots.find((bot) => bot.id === result.agentId)?.name)
        || (settings.botId ? `bot ${settings.botId.slice(0, 8)}` : 'bot padrão');
      tray.setImage(createTrayIcon({ unread: true }));
      tray.setToolTip(`GrokBot Assistant — Nova resposta de ${name}`);
      if (settings.notifyOnReply && Notification.isSupported()) {
        const notification = new Notification({ title: name,
          body: [...reply.text.replace(/[*`#]/g, '')].slice(0, 140).join(''),
          silent: false, icon: appIconPath() });
        notification.on('click', () => {
          if (!promptWindow.isVisible()) togglePrompt();
          else { clearUnread(); promptWindow.focus(); }
        });
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
    width: 520,
    height: 860,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: 'GrokBot Assistant — Configurações',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1b1f' : '#f6f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWindow.setMenu(null);
  if (welcome) settingsWindow.setSize(520, 900);
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

  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const [width, height] = promptWindow.getSize();
  const { x, y } = promptPosition(workArea, { width, height });
  promptWindow.setPosition(x, y);
  clearUnread();
  promptWindow.show();
  promptWindow.focus();
  const roster = listBots(GROK_BOT_DIRECTORY);
  const bot = roster.ok ? roster.bots.find((item) => item.id === settings.botId) : undefined;
  const botName = settings.botName || bot?.name || '';
  promptWindow.webContents.send('prompt:show', {
    history,
    botId: settings.botId, botName,
    conversation: loadConversation(), waiting: Boolean(pending), sent: pending?.sent,
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
    // Avisa também quando o Electron rejeita o acelerador.
  }

  tray.displayBalloon({
    title: 'GrokBot Assistant',
    content: `Não foi possível registrar o atalho ${accelerator}. Ele pode estar em uso por outro programa.`,
  });
  return false;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    app.setAppUserModelId('app.grokbot.assistant');
    Object.assign(settingsLocation, { path: path.join(app.getPath('userData'), 'settings.json') });
    Object.freeze(settingsLocation);
    const firstRun = isFirstRun(fs.existsSync(settingsLocation.path));
    settings = loadSettings(settingsLocation.path);
    history = loadHistory(historyFile);
    nativeTheme.themeSource = settings.theme;
    nativeTheme.on('updated', updateSettingsBackground);
    tray = new Tray(createTrayIcon());
    tray.setToolTip('GrokBot Assistant');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir prompt', click: () => {
        if (promptWindow && !promptWindow.isVisible()) togglePrompt();
      } },
      { label: 'Configurações…', click: () => openSettings() },
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() },
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
      height: 128,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      backgroundColor: '#00000000',
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
      if (!sendingPrompt && pending?.mode !== 'wait') promptWindow.hide();
    });
    ipcMain.handle('prompt:resize', (_event, height) => {
      if (typeof height !== 'number' || !Number.isFinite(height)) return;
      const bounds = promptWindow.getBounds();
      promptWindow.setBounds({ ...bounds, height: Math.max(128, Math.min(600, Math.ceil(height))) });
    });

    ipcMain.handle('prompt:open-link', (_event, url) => {
      if (typeof url !== 'string') return;
      try {
        const protocol = new URL(url).protocol;
        if (protocol === 'http:' || protocol === 'https:') return shell.openExternal(url).catch(() => {});
      } catch { /* Ignora endereços inválidos. */ }
    });

    ipcMain.handle('prompt:submit', async (_event, text) => {
      const result = buildPromptLink({ text, botId: settings.botId });
      if (!result.ok) return result;
      if (!result.url.startsWith('grokbot://app/v1/prompt?')) {
        return { ok: false, error: 'open-failed' };
      }

      const request = { sentAt: Date.now(), botId: settings.botId, mode: settings.afterSend,
        sent: { role: 'user', text: text.trim(), timestampMs: Date.now() } };
      try {
        sendingPrompt = true;
        await shell.openExternal(result.url);
        history = addToHistory(history, text);
        try { saveHistory(historyFile, history); } catch { /* O envio já ocorreu; mantém o histórico em memória. */ }
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
          // As tentativas são temporárias; applyShortcut mantém apenas o escolhido.
          globalShortcut.unregister(accelerator);
        }
      });
      if (chosen.changed) settings.shortcut = chosen.shortcut;
      applyShortcut(settings.shortcut);
      if (app.isPackaged) {
        app.setLoginItemSettings({ openAtLogin: true });
        settings.launchAtLogin = true;
      }
      settings = saveSettings(settingsLocation.path, settings);
      openSettings({ welcome: true });
      tray.displayBalloon({
        title: 'GrokBot Assistant está pronto',
        content: `Use ${settings.shortcut} para abrir o prompt. O ícone fica aqui na bandeja.`,
      });
      return;
    }
    // Mantém a inicialização com o Windows apontando para o executável instalado.
    if (app.isPackaged && settings.launchAtLogin) app.setLoginItemSettings({ openAtLogin: true });
    applyShortcut(settings.shortcut);
  });

  app.on('second-instance', () => {
    if (promptWindow && !promptWindow.isVisible()) togglePrompt();
  });

  app.on('will-quit', () => {
    clearTimeout(hideTimer);
    stopWaiting();
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    // O app continua ativo na bandeja sem janelas abertas.
  });
}
