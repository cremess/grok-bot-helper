const fs = require('node:fs/promises');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { buildIco } = require('./ico');

const root = path.join(__dirname, '..');

async function renderSvg(svg, size) {
  const window = new BrowserWindow({
    show: false,
    width: size,
    height: size,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true },
  });

  try {
    const html = `<!doctype html><html><head><style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
      svg { display: block; width: 100%; height: 100%; }
    </style></head><body>${svg}</body></html>`;
    await new Promise((resolve, reject) => {
      window.webContents.once('did-finish-load', resolve);
      window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(reject);
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    let image = await window.webContents.capturePage();
    const capturedSize = image.getSize();
    if (capturedSize.width !== size || capturedSize.height !== size) {
      image = image.resize({ width: size, height: size, quality: 'best' });
    }
    return image.toPNG();
  } finally {
    window.destroy();
  }
}

async function writeOutput(relativePath, buffer) {
  const outputPath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buffer);
  console.log(`Gerado: ${relativePath}`);
}

// Mantém o processo ativo entre as janelas invisíveis de renderização.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const traySvg = await fs.readFile(path.join(root, 'assets', 'tray.svg'), 'utf8');
  const unreadSvg = await fs.readFile(path.join(root, 'assets', 'tray-unread.svg'), 'utf8');
  for (const size of [16, 32]) {
    await writeOutput(`assets/icons/tray-unread${size === 32 ? '@2x' : ''}.png`, await renderSvg(unreadSvg, size));
  }
  const iconSvg = await fs.readFile(path.join(root, 'assets', 'icon.svg'), 'utf8');
  const entries = [];
  for (const size of [16, 32, 48, 64, 128, 256]) {
    const png = await renderSvg(size <= 32 ? traySvg : iconSvg, size);
    entries.push({ size, png });
    if (size === 16) await writeOutput('assets/icons/tray.png', png);
    if (size === 32) await writeOutput('assets/icons/tray@2x.png', png);
    if (size === 256) await writeOutput('assets/icons/icon-256.png', png);
  }
  await writeOutput('build/icon.ico', buildIco(entries));
  app.quit();
}).catch((error) => {
  console.error('Erro ao gerar os ícones:', error);
  app.exit(1);
});
