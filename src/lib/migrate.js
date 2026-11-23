const fs = require('node:fs');
const path = require('node:path');

function migrateUserData(oldDir, newDir) {
  const migrated = [];
  try {
    fs.mkdirSync(newDir, { recursive: true });
    if (fs.existsSync(path.join(newDir, 'settings.json'))) return { migrated };
    // Copy history first so a failed settings copy can be retried on startup.
    for (const file of ['history.json', 'settings.json']) {
      try {
        const source = path.join(oldDir, file);
        if (!fs.existsSync(source)) continue;
        fs.copyFileSync(source, path.join(newDir, file), fs.constants.COPYFILE_EXCL);
        migrated.push(file);
      } catch { /* Preserve existing files and keep startup available on I/O errors. */ }
    }
  } catch { /* Migration must never prevent startup. */ }
  return { migrated };
}

module.exports = { migrateUserData };
