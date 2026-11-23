function parseInline(text, depth = 0) {
  const nodes = [];
  const literal = (value) => {
    if (nodes.at(-1)?.type === 'text') nodes.at(-1).text += value;
    else nodes.push({ type: 'text', text: value });
  };
  for (let index = 0; index < text.length;) {
    const rest = text.slice(index);
    if (rest[0] === '\n') {
      nodes.push({ type: 'break' });
      index += 1;
      continue;
    }
    const link = /^\[([^\]\n]+)\]\(([^\s]*)\)/.exec(rest);
    if (link) {
      let safe = false;
      try {
        const url = new URL(link[2]);
        safe = url.protocol === 'http:' || url.protocol === 'https:';
      } catch { /* Invalid URLs remain literal. */ }
      if (safe) nodes.push({ type: 'link', text: link[1], href: link[2] });
      else literal(link[0]);
      index += link[0].length;
      continue;
    }
    const marker = rest.startsWith('**') ? '**' : ['*', '_', '`'].includes(rest[0]) ? rest[0] : null;
    if (marker && depth < 32) {
      const end = text.indexOf(marker, index + marker.length);
      if (end > index + marker.length) {
        const content = text.slice(index + marker.length, end);
        nodes.push(marker === '`' ? { type: 'code', text: content }
          : { type: marker === '**' ? 'strong' : 'em', children: parseInline(content, depth + 1) });
        index = end + marker.length;
        continue;
      }
      // Preserve incomplete markers without reinterpreting their characters.
      literal(marker);
      index += marker.length;
      continue;
    }
    literal(text[index]);
    index += 1;
  }
  return nodes;
}

function parseMarkdown(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  try {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    const heading = (line) => /^(#{1,3})\s+(.+)$/.exec(line);
    const list = (line) => /^(-|\*|\d+\.)\s+(.+)$/.exec(line);
    const quote = (line) => /^> (.*)$/.exec(line);
    const fence = (line) => /^```/.test(line);
    const special = (line) => heading(line) || list(line) || quote(line) || fence(line);
    for (let index = 0; index < lines.length;) {
      const line = lines[index];
      if (!line.trim()) { index += 1; continue; }
      if (fence(line)) {
        let end = index + 1;
        while (end < lines.length && !/^```\s*$/.test(lines[end])) end += 1;
        if (end < lines.length) {
          blocks.push({ type: 'code', text: lines.slice(index + 1, end).join('\n') });
          index = end + 1;
        } else {
          blocks.push({ type: 'paragraph', children: [{ type: 'text', text: lines.slice(index).join('\n') }] });
          index = lines.length;
        }
        continue;
      }
      const title = heading(line);
      if (title) {
        blocks.push({ type: 'heading', level: title[1].length, children: parseInline(title[2]) });
        index += 1;
        continue;
      }
      const item = list(line);
      if (item) {
        const ordered = /\d/.test(item[1]);
        const items = [];
        while (index < lines.length) {
          const next = list(lines[index]);
          if (!next || /\d/.test(next[1]) !== ordered) break;
          items.push(parseInline(next[2]));
          index += 1;
        }
        blocks.push({ type: 'list', ordered, items });
        continue;
      }
      if (quote(line)) {
        const content = [];
        while (index < lines.length && quote(lines[index])) content.push(quote(lines[index++])[1]);
        blocks.push({ type: 'quote', children: parseInline(content.join('\n')) });
        continue;
      }
      const content = [line];
      index += 1;
      while (index < lines.length && lines[index].trim() && !special(lines[index])) content.push(lines[index++]);
      blocks.push({ type: 'paragraph', children: parseInline(content.join('\n')) });
    }
    return blocks;
  } catch {
    return [];
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { parseMarkdown };
else globalThis.parseMarkdown = parseMarkdown;
