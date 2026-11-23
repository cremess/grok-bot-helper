const fs = require('node:fs');
const path = require('node:path');

function addToHistory(list, text, max = 50) {
  const limit = Number.isInteger(max) && max > 0 ? max : 50;
  const value = typeof text === 'string' ? text.trim() : '';
  const entries = Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
  return (value ? [...entries.filter((item) => item !== value), value] : entries).slice(-limit);
}

function loadHistory(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (!Array.isArray(data)) return [];
    return data.reduce((list, text) => addToHistory(list, text), []);
  } catch {
    return [];
  }
}

function saveHistory(file, list) {
  const entries = Array.isArray(list) ? list.reduce((items, text) => addToHistory(items, text), []) : [];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(entries, null, 2), 'utf8');
  fs.renameSync(`${file}.tmp`, file);
}

module.exports = { loadHistory, addToHistory, saveHistory };
