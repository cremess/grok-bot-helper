(() => {
  // Saved prompt templates: a short name and some text the prompt can put at the start of a message.
  const MAX_TEMPLATES = 30;
  const MAX_TEMPLATE_NAME = 40;
  const MAX_TEMPLATE_TEXT = 500;

  const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  const length = (text) => [...text].length;

  // Returns a clean { name, text } copy, or null if the item is not a usable template.
  function normalizeTemplate(item) {
    if (!isPlainObject(item) || typeof item.name !== 'string' || typeof item.text !== 'string') return null;
    const name = item.name.trim();
    const text = item.text.trim();
    if (!name || !text || length(name) > MAX_TEMPLATE_NAME || length(text) > MAX_TEMPLATE_TEXT) return null;
    return { name, text };
  }

  // For settings read from disk: keeps the valid templates (up to the maximum) and drops the rest.
  function normalizeTemplates(list) {
    if (!Array.isArray(list)) return [];
    return list.map(normalizeTemplate).filter(Boolean).slice(0, MAX_TEMPLATES);
  }

  // For a save request from the settings window: all or nothing, so a bad item is reported, not lost.
  function validateTemplates(list) {
    if (!Array.isArray(list) || list.length > MAX_TEMPLATES) return { ok: false };
    const templates = list.map(normalizeTemplate);
    return templates.every(Boolean) ? { ok: true, templates } : { ok: false };
  }

  // Puts the template at the start of the draft, on its own line when there is already text.
  function applyTemplate(draft, text) {
    const current = typeof draft === 'string' ? draft : '';
    if (typeof text !== 'string' || !text) return current;
    return current.trim() ? `${text}\n${current}` : `${text} `;
  }

  const api = { MAX_TEMPLATES, MAX_TEMPLATE_NAME, MAX_TEMPLATE_TEXT, normalizeTemplate, normalizeTemplates,
    validateTemplates, applyTemplate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(globalThis, api);
})();
