const { nativeImage } = require('electron');

function createTrayIcon() {
  const size = 16;
  const bitmap = Buffer.alloc(size * size * 4);

  // Cada pixel usa a ordem BGRA para formar o quadrado azul #1080f3.
  for (let offset = 0; offset < bitmap.length; offset += 4) {
    bitmap[offset] = 0xf3;
    bitmap[offset + 1] = 0x80;
    bitmap[offset + 2] = 0x10;
    bitmap[offset + 3] = 0xff;
  }

  return nativeImage.createFromBitmap(bitmap, { width: size, height: size });
}

module.exports = { createTrayIcon };
