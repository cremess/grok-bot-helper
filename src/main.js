const path = require('node:path');
const { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeTheme, screen, shell, Tray } = require('electron');
const { createTrayIcon, appIconPath } = require('./icon');
const { buildPromptLink, parseBotId, isValidBotId } = require('./lib/link');
const { listBots } = require('./lib/roster');
const { avatarColor, avatarInitial } = require('./lib/avatar');
const { loadSettings, saveSettings, isValidShortcut, DEFAULT_SETTINGS } = require('./lib/settings');
const { promptPosition } = require('./lib/position');

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

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    icon: appIconPath(),
    width: 520,
    height: 720,
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
  settingsWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWindow.on('closed', () => {
    settingsWindow = undefined;
    applyShortcut(settings.shortcut);
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings', 'settings.html'));
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
  promptWindow.show();
  promptWindow.focus();
  const roster = listBots(GROK_BOT_DIRECTORY);
  const bot = roster.ok ? roster.bots.find((item) => item.id === settings.botId) : undefined;
  const botName = settings.botName || bot?.name || '';
  promptWindow.webContents.send('prompt:show', {
    botId: settings.botId, botName,
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
    Object.assign(settingsLocation, { path: path.join(app.getPath('userData'), 'settings.json') });
    Object.freeze(settingsLocation);
    settings = loadSettings(settingsLocation.path);
    tray = new Tray(createTrayIcon());
    tray.setToolTip('GrokBot Assistant');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir prompt', click: () => {
        if (promptWindow && !promptWindow.isVisible()) togglePrompt();
      } },
      { label: 'Configurações…', click: openSettings },
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
    ipcMain.handle('settings:bots', () => {
      const result = listBots(GROK_BOT_DIRECTORY);
      if (!result.ok) return result;
      return { ok: true, bots: result.bots.map((bot) => ({
        ...bot, avatar: { color: avatarColor(bot.color, bot.id), initial: avatarInitial(bot.name) },
      })) };
    });
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
      const { shortcut, launchAtLogin } = payload;
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
          botId, botName, shortcut, launchAtLogin: Boolean(launchAtLogin),
        });
        return { ok: true, settings };
      } catch {
        if (shortcut !== previousSettings.shortcut) applyShortcut(previousSettings.shortcut);
        return { ok: false, error: 'unexpected' };
      }
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
      if (!sendingPrompt) promptWindow.hide();
    });
    ipcMain.handle('prompt:resize', (_event, height) => {
      if (typeof height !== 'number' || !Number.isFinite(height)) return;
      const bounds = promptWindow.getBounds();
      promptWindow.setBounds({ ...bounds, height: Math.max(128, Math.min(360, Math.ceil(height))) });
    });

    ipcMain.handle('prompt:submit', async (_event, text) => {
      const result = buildPromptLink({ text, botId: settings.botId });
      if (!result.ok) return result;
      if (!result.url.startsWith('grokbot://app/v1/prompt?')) {
        return { ok: false, error: 'open-failed' };
      }

      try {
        sendingPrompt = true;
        await shell.openExternal(result.url);
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          sendingPrompt = false;
          promptWindow.hide();
        }, 280);
        return { ok: true };
      } catch {
        sendingPrompt = false;
        return { ok: false, error: 'open-failed' };
      }
    });
    ipcMain.handle('prompt:hide', () => promptWindow.hide());

    await promptWindow.loadFile(path.join(__dirname, 'prompt', 'prompt.html'));
    applyShortcut(settings.shortcut);
  });

  app.on('second-instance', () => {
    if (promptWindow && !promptWindow.isVisible()) togglePrompt();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    // O app continua ativo na bandeja sem janelas abertas.
  });
}
