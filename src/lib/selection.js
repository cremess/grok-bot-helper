// Pure helpers for "send the selected text": the main process clears the clipboard, simulates Ctrl+C
// in the focused app, reads the copied text and puts the previous clipboard back. Nothing here logs or
// stores clipboard contents.

const SELECTION_TIMEOUT_MS = 600;

// Trims the copied text and cuts it to `max` code points (an emoji counts as one, as in the counter).
function clipSelection(text, max) {
  const trimmed = typeof text === 'string' ? text.replace(/\r\n?/g, '\n').trim() : '';
  const points = [...trimmed];
  if (!Number.isInteger(max) || max < 0 || points.length <= max) return { text: trimmed, clipped: false };
  return { text: points.slice(0, max).join('').trimEnd(), clipped: true };
}

// What the clipboard poll does next. The clipboard was cleared before Ctrl+C, so any format showing up
// means the other app answered: text ends the wait, anything else (an image, files) means there is no
// text to use. An empty clipboard keeps waiting until the timeout.
function selectionPollDecision({ text, formats, elapsedMs, timeoutMs = SELECTION_TIMEOUT_MS }) {
  if (typeof text === 'string' && text.trim()) return 'text';
  if (Array.isArray(formats) && formats.length) return 'no-text';
  return elapsedMs >= timeoutMs ? 'timeout' : 'wait';
}

// Builds what to write back from a snapshot taken before copying. Only the formats Electron can both
// read and write are kept (text, HTML, RTF and image); a snapshot with none of them means the clipboard
// was empty (or held only formats that can't be restored), so it is cleared instead.
// Password managers mark secrets with formats that keep them out of the clipboard history. Writing the
// text back would drop that mark and could put the secret in Win+V history or cloud sync, so a marked
// clipboard is cleared instead of restored.
const PRIVATE_FORMATS = /ExcludeClipboardContentFromMonitorProcessing|CanIncludeInClipboardHistory|CanUploadToCloudClipboard|Clipboard Viewer Ignore/i;

function restorePlan(snapshot) {
  if (Array.isArray(snapshot?.formats) && snapshot.formats.some((format) => PRIVATE_FORMATS.test(String(format)))) {
    return { action: 'clear' };
  }
  const data = {};
  for (const key of ['text', 'html', 'rtf']) {
    if (typeof snapshot?.[key] === 'string' && snapshot[key] !== '') data[key] = snapshot[key];
  }
  if (snapshot?.image) data.image = snapshot.image;
  return Object.keys(data).length ? { action: 'write', data } : { action: 'clear' };
}

module.exports = { SELECTION_TIMEOUT_MS, clipSelection, selectionPollDecision, restorePlan };
