(() => {
  let sequence = 0;
  const normalize = (text) => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  globalThis.BotPicker = {
    create({ container, onSelect, includeDefault = true, includeManual = false, compact = false }) {
      const id = `bot-picker-${++sequence}`;
      const root = element('div', `bot-picker${compact ? ' bot-picker-compact' : ''}`);
      const trigger = element('button', 'bot-picker-trigger');
      trigger.type = 'button';
      trigger.setAttribute('aria-label', 'Bot de destino');
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', `${id}-list`);
      const image = element('span', 'avatar');
      image.setAttribute('aria-hidden', 'true');
      const label = element('span', 'bot-picker-label');
      const name = element('strong');
      if (compact) label.append('Para ');
      label.append(name);
      const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      chevron.setAttribute('viewBox', '0 0 16 16');
      chevron.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'm4 6 4 4 4-4');
      chevron.append(path);
      trigger.append(image, label, chevron);
      const popover = element('div', 'bot-picker-popover');
      popover.hidden = true;
      const search = element('input', 'bot-picker-search');
      search.type = 'search';
      search.placeholder = 'Buscar bot…';
      search.setAttribute('aria-label', 'Buscar bot');
      search.setAttribute('role', 'combobox');
      search.setAttribute('aria-autocomplete', 'list');
      search.setAttribute('aria-expanded', 'false');
      search.setAttribute('aria-controls', `${id}-list`);
      const list = element('div', 'bot-picker-list');
      list.id = `${id}-list`;
      list.tabIndex = -1;
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-label', 'Bot de destino');
      popover.append(search, list);
      root.append(trigger, popover);
      container.append(root);
      let bots = [];
      let value = { mode: 'default', botId: '', botName: '' };
      let options = [];
      let active = -1;
      let destroyed = false;

      function matches(option) {
        return option.mode === value.mode && (option.mode !== 'list' || option.botId === value.botId);
      }
      function renderTrigger() {
        const bot = bots.find((item) => item.id === value.botId);
        name.textContent = value.mode === 'default' ? (compact ? 'Grok' : 'Bot padrão do Grok Bot')
          : value.mode === 'manual' ? 'Outro bot (colar link ou ID)…'
            : bot?.name || value.botName || `bot ${String(value.botId).slice(0, 8)}`;
        image.textContent = bot?.avatar?.initial || (value.mode === 'manual' ? '+' : name.textContent[0]);
        image.style.backgroundColor = bot?.avatar?.color || '#1080f3';
        trigger.setAttribute('aria-label', `Bot de destino: ${name.textContent}`);
        trigger.title = compact ? `${name.textContent} (Ctrl+K)` : name.textContent;
      }
      function setActive(index, scroll = false) {
        active = options.length ? (index + options.length) % options.length : -1;
        for (const [i, option] of options.entries()) option.node.classList.toggle('active', i === active);
        for (const control of [list, search]) {
          if (active >= 0) control.setAttribute('aria-activedescendant', options[active].node.id);
          else control.removeAttribute('aria-activedescendant');
        }
        if (scroll && active >= 0) options[active].node.scrollIntoView({ block: 'nearest' });
      }
      function close() {
        if (popover.hidden) return;
        popover.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        search.setAttribute('aria-expanded', 'false');
        container.dispatchEvent(new CustomEvent('botpicker:toggle'));
      }
      function choose(option) {
        value = { mode: option.mode, botId: option.botId || '', botName: option.mode === 'list' ? option.botName : '' };
        renderTrigger();
        close();
        trigger.focus({ preventScroll: true });
        onSelect?.(option.mode === 'manual' ? { mode: 'manual' } : { ...value });
      }
      function renderOptions() {
        list.replaceChildren();
        options = [];
        search.hidden = bots.length <= 5;
        const query = normalize(search.value);
        const filtered = bots.filter((bot) => normalize(bot.name).includes(query));
        const heading = element('div', 'bot-picker-heading', 'Seus bots');
        heading.setAttribute('role', 'presentation');
        list.append(heading);
        function append(option, avatar, badge = false) {
          const node = element('div', 'bot-picker-option');
          node.id = `${id}-option-${options.length}`;
          node.setAttribute('role', 'option');
          node.setAttribute('aria-selected', String(matches(option)));
          const icon = element('span', 'avatar', avatar?.initial || 'G');
          icon.setAttribute('aria-hidden', 'true');
          icon.style.backgroundColor = avatar?.color || '#1080f3';
          node.append(icon, element('span', 'bot-picker-name', option.botName));
          if (badge) node.append(element('span', 'bot-picker-badge', 'mais usado'));
          const check = element('span', 'bot-picker-check', matches(option) ? '✓' : '');
          check.setAttribute('aria-hidden', 'true');
          node.append(check);
          const index = options.length;
          node.addEventListener('pointermove', () => setActive(index));
          node.addEventListener('click', () => choose(option));
          options.push({ ...option, node });
          list.append(node);
        }
        for (const bot of filtered) append({ mode: 'list', botId: bot.id, botName: bot.name }, bot.avatar, bot === bots[0]);
        if (!filtered.length) {
          const empty = element('div', 'bot-picker-empty', 'Nenhum bot encontrado');
          empty.setAttribute('role', 'presentation');
          list.append(empty);
        }
        if (includeDefault || includeManual) {
          const divider = element('div', 'bot-picker-divider');
          divider.setAttribute('role', 'presentation');
          list.append(divider);
        }
        if (includeDefault) append({ mode: 'default', botId: '', botName: 'Bot padrão do Grok Bot' });
        if (includeManual) append({ mode: 'manual', botName: 'Outro bot (colar link ou ID)…' }, { initial: '+', color: '#71717a' });
        setActive(Math.max(0, options.findIndex(matches)));
      }
      function open() {
        if (destroyed || trigger.disabled || trigger.matches(':disabled')) return;
        if (!popover.hidden) return;
        search.value = '';
        renderOptions();
        popover.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        search.setAttribute('aria-expanded', 'true');
        (search.hidden ? list : search).focus({ preventScroll: true });
        container.dispatchEvent(new CustomEvent('botpicker:toggle'));
      }
      function keydown(event) {
        if (popover.hidden) {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(); }
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close();
          trigger.focus({ preventScroll: true });
        } else if (event.key === 'Tab') {
          // Devolve o ponto de partida à ordem natural de tabulação antes de fechar.
          trigger.focus({ preventScroll: true });
          close();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setActive(active + (event.key === 'ArrowDown' ? 1 : -1), true);
        } else if ((event.key === 'Home' || event.key === 'End') && event.target !== search) {
          event.preventDefault();
          setActive(event.key === 'Home' ? 0 : options.length - 1, true);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          if (active >= 0) choose(options[active]);
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.target !== search && !search.hidden) {
          event.preventDefault();
          search.focus({ preventScroll: true });
          search.value += event.key;
          renderOptions();
        }
      }
      const outside = (event) => { if (!root.contains(event.target)) close(); };
      trigger.addEventListener('click', () => popover.hidden ? open() : close());
      search.addEventListener('input', renderOptions);
      root.addEventListener('keydown', keydown);
      document.addEventListener('pointerdown', outside);
      document.addEventListener('focusin', outside);
      renderTrigger();
      return {
        setBots(next) {
          bots = [...next];
          renderTrigger();
          renderOptions();
          if (!popover.hidden) {
            if (document.activeElement === search && search.hidden) list.focus({ preventScroll: true });
            container.dispatchEvent(new CustomEvent('botpicker:toggle'));
          }
        },
        setValue(next) { value = { ...next }; renderTrigger(); renderOptions(); },
        getValue() { return { ...value }; },
        open, close,
        focus() { trigger.focus({ preventScroll: true }); },
        destroy() {
          close();
          destroyed = true;
          document.removeEventListener('pointerdown', outside);
          document.removeEventListener('focusin', outside);
          root.remove();
        },
      };
    },
  };
})();
