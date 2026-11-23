const AVATAR_COLORS = {
  black: '#3f3f46', gray: '#71717a', grey: '#71717a', brown: '#9a6b4b',
  red: '#e5484d', orange: '#f76b15', yellow: '#e2a336', green: '#30a46c',
  teal: '#12a594', blue: '#1080f3', indigo: '#5b5bd6', purple: '#8e4ec6', pink: '#d6409f',
};
const AVATAR_PALETTE = [...new Set(Object.values(AVATAR_COLORS))];

function avatarColor(colorName, id) {
  const name = typeof colorName === 'string' ? colorName.trim().toLowerCase() : '';
  if (Object.hasOwn(AVATAR_COLORS, name)) return AVATAR_COLORS[name];
  let hash = 0;
  for (const character of String(id ?? '')) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function avatarInitial(name) {
  return (typeof name === 'string' ? name.match(/[\p{L}\p{N}]/u)?.[0] : null)?.toLocaleUpperCase('pt-BR') || '?';
}

if (typeof module !== 'undefined' && module.exports) module.exports = { avatarColor, avatarInitial };
else Object.assign(globalThis, { avatarColor, avatarInitial });
