const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
let count = 0;
let failed = false;

function checkDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      checkDirectory(file);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      count += 1;
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.status !== 0) {
        failed = true;
        console.error(`Syntax error: ${path.relative(root, file)}`);
        if (result.error) console.error(result.error.message);
        if (result.stdout) console.error(result.stdout.trimEnd());
        if (result.stderr) console.error(result.stderr.trimEnd());
      }
    }
  }
}

for (const directory of ['src', 'scripts', 'test']) {
  checkDirectory(path.join(root, directory));
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`Syntax OK (${count} files)`);
}
