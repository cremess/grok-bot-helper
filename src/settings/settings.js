const form = document.getElementById('settings-form');
const fields = document.getElementById('fields');
const bot = document.getElementById('bot');
const manualField = document.getElementById('manual-field');
const warning = document.getElementById('bots-warning');
const refresh = document.getElementById('refresh');
const shortcut = document.getElementById('shortcut');
const record = document.getElementById('record');
const save = document.getElementById('save');
const launchAtLogin = document.getElementById('launch-at-login');
const notifyOnReply = document.getElementById('notify-on-reply');
const themeOptions = [...document.querySelectorAll('input[name="theme"]')];
function renderGeneral(settings) {
  notifyOnReply.checked = settings.notifyOnReply;
  for (const option of themeOptions) option.checked = option.value === settings.theme;
}
const clearHistory = document.getElementById('clear-history');
const clearConfirmation = document.getElementById('clear-confirmation');
function closeClearConfirmation() {
  clearHistory.hidden = false;
  clearConfirmation.hidden = true;
  clearHistory.focus();
}
clearHistory.addEventListener('click', () => {
  clearHistory.hidden = true;
  clearConfirmation.hidden = false;
  document.getElementById('clear-no').focus();
});
document.getElementById('clear-no').addEventListener('click', closeClearConfirmation);
document.getElementById('clear-yes').addEventListener('click', async (event) => {
  event.target.disabled = true;
  try {
    const result = await window.grokbotSettings.clearHistory();
    if (result.ok) { closeClearConfirmation(); showToast('Histórico de envios limpo'); }
    else showError();
  } catch { showError(); }
  finally { event.target.disabled = false; }
});
const afterSendOptions = [...document.querySelectorAll('input[name="after-send"]')];
const afterSendHelp = document.getElementById('after-send-help');
function renderAfterSend(value) {
  if (value) for (const option of afterSendOptions) option.checked = option.value === value;
  afterSendHelp.textContent = afterSendOptions.find((option) => option.checked)?.value === 'hide'
    ? 'Fecha; marca a bandeja ao chegar.'
    : 'Mostra a resposta no prompt.';
}
for (const option of afterSendOptions) option.addEventListener('change', () => renderAfterSend());
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
  'invalid-option': 'Selecione opções válidas para notificação e tema.',
  'invalid-bot': 'Link ou ID do bot inválido.',
  'invalid-shortcut': 'Atalho inválido.',
  'invalid-after-send': 'Selecione uma opção válida para depois de enviar.',
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

const picker = BotPicker.create({
  container: document.getElementById('bot-picker'),
  includeManual: true,
  onSelect(option) {
    preselectFirstBot = false;
    selection = { mode: option.mode, botId: option.botId || '', botName: option.botName || '' };
    manualField.hidden = selection.mode !== 'manual';
    if (!manualField.hidden) bot.focus();
  },
});

function renderBots() {
  picker.setBots(bots);
  picker.setValue(selection);
  manualField.hidden = selection.mode !== 'manual';
}

function selectSavedBot(botId) {
  const selectedBot = bots.find((item) => item.id === botId);
  selection = selectedBot ? { mode: 'list', botId, botName: selectedBot.name }
    : { mode: botId ? 'manual' : 'default', botId: '', botName: '' };
  bot.value = botId;
}

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
  document.getElementById('destination-description').hidden = bots.length === 0;
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
      afterSend: afterSendOptions.find((option) => option.checked)?.value,
      notifyOnReply: notifyOnReply.checked,
      theme: themeOptions.find((option) => option.checked)?.value,
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
    renderAfterSend(result.settings.afterSend);
    renderGeneral(result.settings);
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
    renderAfterSend(settings.afterSend);
    renderGeneral(settings);
    fields.disabled = false;
    save.disabled = false;
  } catch {
    showError();
  }
}
initialize();
