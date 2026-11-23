const { app, Menu, Tray } = require('electron');
const { createTrayIcon } = require('./icon');

// Mantém o ícone vivo durante a execução do app.
let tray;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    tray = new Tray(createTrayIcon());
    tray.setToolTip('GrokBot Assistant');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Sair', click: () => app.quit() },
    ]));
  });

  app.on('window-all-closed', () => {
    // O app continua ativo na bandeja sem janelas abertas.
  });
}
