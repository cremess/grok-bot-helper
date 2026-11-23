const MAX_TEXT_LENGTH = 1000;
const BOT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function validateText(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'empty' };
  }

  const trimmedText = text.trim();
  if ([...trimmedText].length > MAX_TEXT_LENGTH) {
    return { ok: false, error: 'too-long' };
  }

  return { ok: true, text: trimmedText };
}

function isValidBotId(id) {
  return typeof id === 'string' && BOT_ID_PATTERN.test(id);
}

function parseBotId(input) {
  if (typeof input !== 'string') return null;

  const trimmedInput = input.trim();
  if (isValidBotId(trimmedInput)) return trimmedInput;

  try {
    const url = new URL(trimmedInput);
    const isAppLink = (url.protocol === 'grokbot:' || url.protocol === 'sand:')
      && url.host === 'app' && url.pathname === '/v1/agent';
    const isWebLink = url.protocol === 'https:' && url.host === 'cursor.com'
      && (url.pathname === '/grok-bot/link/v1/agent'
        || url.pathname === '/sand/link/v1/agent');

    if (!isAppLink && !isWebLink) return null;

    const id = url.searchParams.get('id');
    return isValidBotId(id) ? id : null;
  } catch {
    return null;
  }
}

function buildPromptLink({ text, botId }) {
  const validation = validateText(text);
  if (!validation.ok) return validation;

  const hasBotId = botId !== undefined && botId !== null && botId !== '';
  if (hasBotId && !isValidBotId(botId)) {
    return { ok: false, error: 'invalid-bot-id' };
  }

  const params = new URLSearchParams();
  if (hasBotId) params.set('id', botId);
  params.set('text', validation.text);

  return {
    ok: true,
    url: `grokbot://app/v1/prompt?${params.toString().replace(/\+/g, '%20')}`,
  };
}

module.exports = {
  MAX_TEXT_LENGTH,
  validateText,
  isValidBotId,
  parseBotId,
  buildPromptLink,
};
