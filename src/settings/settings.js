const form = document.getElementById('settings-form');
const fields = document.getElementById('fields');
const bot = document.getElementById('bot');
const botList = document.getElementById('bots');
const manualField = document.getElementById('manual-field');
const warning = document.getElementById('bots-warning');
const refresh = document.getElementById('refresh');
const shortcut = document.getElementById('shortcut');
const record = document.getElementById('record');
const save = document.getElementById('save');
const launchAtLogin = document.getElementById('launch-at-login');
const status = document.getElementById('status');
const welcomeMode = new URLSearchParams(location.search).get('welcome') === '1';
const welcomeCard = document.getElementById('welcome');
const welcomeMessage = document.getElementById('welcome-message');
let preselectFirstBot = false;
if (welcomeMode) {
  document.body.classList.add('welcome');
  welcomeCard.hidden = false;
  save.textContent = 'Salvar e começar';
}
let bots = [];
let selection = { mode: 'default', botId: '', botName: '' };
let currentShortcut;
let previousShortcut;
let defaultShortcut;
let recording = false;
let toastTimer;

const errors = {
  'invalid-bot': 'Link ou ID do bot inválido.',
  'invalid-shortcut': 'Atalho inválido.',
  'shortcut-taken': 'Esse atalho já está em uso por outro programa.',
};

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  status.classList.toggle('error', isError);
  status.textContent = message;
  status.hidden = false;
  toastTimer = setTimeout(() => { status.hidden = true; }, 2500);
}

function showError(error) {
  showToast(errors[error] || 'Erro inesperado.', true);
}

function renderShortcut() {
  renderWelcome();
  shortcut.replaceChildren();
  if (recording) {
    shortcut.textContent = 'Pressione a combinação…';
    return;
  }
  for (const key of currentShortcut.split('+')) {
    const kbd = document.createElement('kbd');
    kbd.textContent = key;
    shortcut.append(kbd);
  }
}

function renderWelcome() {
  if (!welcomeMode) return;
  welcomeMessage.replaceChildren();
  if (bots.length === 0) {
    welcomeMessage.textContent = 'Não encontrei o Grok Bot neste computador. Instale e abra o Grok Bot, depois clique em Atualizar lista.';
    return;
  }
  const kbd = document.createElement('kbd');
  kbd.textContent = currentShortcut || '';
  welcomeMessage.append('Escolha para qual bot do Grok Bot suas mensagens vão. Depois é só apertar ', kbd, ' em qualquer lugar.');
}

function preselectBot() {
  if (!preselectFirstBot || bots.length === 0) return;
  selectSavedBot(bots[0].id);
  preselectFirstBot = false;
}

function stopRecording() {
  if (!recording) return;
  recording = false;
  record.classList.remove('recording');
  record.textContent = 'Alterar';
  renderShortcut();
  window.grokbotSettings.setRecording(false).catch(() => showError());
}

record.addEventListener('click', () => {
  if (recording) return;
  previousShortcut = currentShortcut;
  recording = true;
  record.classList.add('recording');
  record.textContent = 'Gravando…';
  renderShortcut();
  window.grokbotSettings.setRecording(true).catch(() => {
    stopRecording();
    showError();
  });
});
record.addEventListener('keydown', (event) => {
  if (!recording) return;
  if (event.code === 'Tab') {
    stopRecording();
    return;
  }
  event.preventDefault();
  if (event.code === 'Escape') {
    currentShortcut = previousShortcut;
    stopRecording();
    return;
  }
  const value = acceleratorFromKeyEvent(event);
  if (value !== null) {
    currentShortcut = value;
    stopRecording();
  }
});
record.addEventListener('blur', stopRecording);
document.getElementById('restore').addEventListener('click', () => {
  stopRecording();
  currentShortcut = defaultShortcut;
  renderShortcut();
});

function selectOption(option) {
  selection = { mode: option.mode, botId: option.botId, botName: option.botName };
  const items = [...botList.children];
  for (const item of items) {
    const selected = item.dataset.mode === selection.mode
      && (selection.mode !== 'list' || item.dataset.botId === selection.botId);
    item.setAttribute('aria-checked', String(selected));
    item.tabIndex = selected ? 0 : -1;
  }
  manualField.hidden = selection.mode !== 'manual';
}

function renderBots() {
  botList.replaceChildren();
  const options = bots.map((item, index) => ({
    mode: 'list', botId: item.id, botName: item.name, avatar: item.avatar, badge: index === 0,
  }));
  options.unshift(
    { mode: 'default', botId: '', botName: 'Bot padrão do Grok Bot', avatar: { color: '#1080f3', initial: 'G' } },
  );
  options.push(
    { mode: 'manual', botId: '', botName: 'Outro bot (colar link ou ID)', avatar: { color: '#71717a', initial: '+' } },
  );
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bot-option';
    button.setAttribute('role', 'radio');
    button.dataset.mode = option.mode;
    button.dataset.botId = option.botId;
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.style.backgroundColor = option.avatar.color;
    avatar.textContent = option.avatar.initial;
    const name = document.createElement('span');
    name.className = 'bot-name';
    name.textContent = option.botName;
    button.append(avatar, name);
    if (option.badge) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'mais usado';
      button.append(badge);
    }
    const check = document.createElement('span');
    check.className = 'selection-check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = '\u2713';
    button.append(check);
    button.addEventListener('click', () => {
      preselectFirstBot = false;
      selectOption(option);
    });
    botList.append(button);
  }
  selectOption(selection);
  botList.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest' });
}

function selectSavedBot(botId) {
  const selectedBot = bots.find((item) => item.id === botId);
  selection = selectedBot ? { mode: 'list', botId, botName: selectedBot.name }
    : { mode: botId ? 'manual' : 'default', botId: '', botName: '' };
  bot.value = botId;
}

botList.addEventListener('keydown', (event) => {
  const items = [...botList.children];
  const index = items.indexOf(event.target);
  if (index < 0) return;
  let next;
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % items.length;
  else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index + items.length - 1) % items.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = items.length - 1;
  else return;
  event.preventDefault();
  items[next].click();
  items[next].focus();
});

async function loadBots() {
  refresh.disabled = true;
  try {
    const result = await window.grokbotSettings.bots();
    bots = result.ok && Array.isArray(result.bots) ? result.bots : [];
  } catch {
    bots = [];
  } finally {
    refresh.disabled = false;
  }
  warning.hidden = bots.length > 0;
  renderWelcome();
}

refresh.addEventListener('click', async () => {
  await loadBots();
  preselectBot();
  if (selection.mode === 'list') {
    const selectedBot = bots.find((item) => item.id === selection.botId);
    if (selectedBot) selection.botName = selectedBot.name;
    else selectSavedBot(selection.botId);
  }
  renderBots();
});

document.getElementById('close').addEventListener('click', () => window.close());
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (fields.disabled) return;
  stopRecording();
  fields.disabled = true;
  save.disabled = true;
  try {
    const result = await window.grokbotSettings.save({
      mode: selection.mode, botId: selection.botId, botName: selection.botName,
      botInput: bot.value, shortcut: currentShortcut, launchAtLogin: launchAtLogin.checked,
    });
    if (!result.ok) {
      showError(result.error);
      return;
    }
    selectSavedBot(result.settings.botId);
    renderBots();
    currentShortcut = result.settings.shortcut;
    renderShortcut();
    launchAtLogin.checked = result.settings.launchAtLogin;
    showToast('Configurações salvas');
    if (welcomeMode) setTimeout(() => window.close(), 800);
  } catch {
    showError();
  } finally {
    fields.disabled = false;
    save.disabled = false;
  }
});

async function initialize() {
  try {
    const [settings] = await Promise.all([window.grokbotSettings.get(), loadBots()]);
    selectSavedBot(settings.botId);
    preselectFirstBot = welcomeMode && !settings.botId;
    preselectBot();
    renderBots();
    currentShortcut = settings.shortcut;
    defaultShortcut = settings.defaultShortcut;
    renderShortcut();
    launchAtLogin.checked = settings.launchAtLogin;
    fields.disabled = false;
    save.disabled = false;
  } catch {
    showError();
  }
}
initialize();
