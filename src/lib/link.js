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

// A long message can go out as several deep links, one after the other. Ten parts is already
// 10 000 characters; more than that is more likely a paste by mistake than a message.
const MAX_PARTS = 10;

// Finds where the first part should end (as a code point index), preferring the last match that
// leaves at least `minimum` code points in the part.
function lastBreak(window, regex, budget, minimum, atEnd) {
  let best = -1;
  for (const match of window.matchAll(regex)) {
    const end = [...window.slice(0, atEnd ? match.index + match[0].length : match.index)].length;
    if (end <= budget && end >= minimum) best = end;
  }
  return best;
}

function chunk(text, budget) {
  const parts = [];
  let rest = text;
  while ([...rest].length > budget) {
    const points = [...rest];
    // One extra code point lets a break right at the limit see the space that follows it.
    const window = points.slice(0, budget + 1).join('');
    const half = Math.floor(budget / 2);
    let end = lastBreak(window, /\n[^\S\n]*\n/gu, budget, half, false);
    if (end === -1) end = lastBreak(window, /[.!?…]+["'”’)\]]*(?=\s)/gu, budget, half, true);
    if (end === -1) end = lastBreak(window, /\s/gu, budget, 1, false);
    if (end === -1) end = budget;
    const part = points.slice(0, end).join('').trimEnd();
    if (part) parts.push(part);
    rest = points.slice(end).join('').trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

// Splits a message into parts of at most `max` code points each, counting the "(1/N) " prefix. Breaks
// go at a paragraph if one is in the second half of the part, then at the end of a sentence, then at a
// space, and only cut a word when there is no space at all. Emoji count as one character, as in the
// counter, and are never cut in half. A message that already fits comes back as one part, unprefixed.
function splitMessage(text, max = MAX_TEXT_LENGTH) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) return [];
  if ([...trimmed].length <= max) return [trimmed];
  // The prefix grows with the number of parts, so retry with a smaller budget until the count fits.
  let digits = 1;
  for (;;) {
    const budget = max - `(${'9'.repeat(digits)}/${'9'.repeat(digits)}) `.length;
    if (budget < 1) return [];
    const parts = chunk(trimmed, budget);
    if (String(parts.length).length <= digits) {
      return parts.map((part, index) => `(${index + 1}/${parts.length}) ${part}`);
    }
    digits = String(parts.length).length;
  }
}

module.exports = {
  MAX_TEXT_LENGTH,
  MAX_PARTS,
  splitMessage,
  validateText,
  isValidBotId,
  parseBotId,
  buildPromptLink,
};
