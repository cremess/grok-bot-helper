const path = require('node:path');
const { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen, shell, Tray } = require('electron');
const { createTrayIcon } = require('./icon');
const { buildPromptLink } = require('./lib/link');
const { loadSettings } = require('./lib/settings');
const { promptPosition } = require('./lib/position');

// Mantém o ícone vivo durante a execução do app.
let tray;
let promptWindow;
let settings;
let registeredShortcut;

function togglePrompt() {
  if (!promptWindow) return;
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
  promptWindow.webContents.send('prompt:show', { botId: settings.botId });
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
    settings = loadSettings(path.join(app.getPath('userData'), 'settings.json'));
    tray = new Tray(createTrayIcon());
    tray.setToolTip('GrokBot Assistant');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Sair', click: () => app.quit() },
    ]));

    promptWindow = new BrowserWindow({
      width: 640,
      height: 150,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      backgroundColor: '#1b1b1f',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    promptWindow.webContents.on('will-navigate', (event) => event.preventDefault());
    promptWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    promptWindow.on('blur', () => promptWindow.hide());

    ipcMain.handle('prompt:submit', async (_event, text) => {
      const result = buildPromptLink({ text, botId: settings.botId });
      if (!result.ok) return result;
      if (!result.url.startsWith('grokbot://app/v1/prompt?')) {
        return { ok: false, error: 'open-failed' };
      }

      try {
        await shell.openExternal(result.url);
        promptWindow.hide();
        return { ok: true };
      } catch {
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
