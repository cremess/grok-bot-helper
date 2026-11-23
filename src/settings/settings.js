const form = document.getElementById('settings-form');
const fields = document.getElementById('fields');
const bot = document.getElementById('bot');
const botHelp = document.getElementById('bot-help');
const shortcut = document.getElementById('shortcut');
const launchAtLogin = document.getElementById('launch-at-login');
const status = document.getElementById('status');
let currentShortcut;
let previousShortcut;
let defaultShortcut;

const errors = {
  'invalid-bot': 'Link ou ID do bot inválido.',
  'invalid-shortcut': 'Atalho inválido.',
  'shortcut-taken': 'Esse atalho já está em uso por outro programa.',
};

function showError(error) {
  status.classList.add('error');
  status.textContent = errors[error] || 'Erro inesperado.';
}

function updateBotHelp() {
  const value = bot.value.trim();
  botHelp.textContent = !value ? 'Usará o bot padrão do Grok Bot'
    : /^[A-Za-z0-9_-]{1,128}$/.test(value) ? `ID reconhecido: ${value}`
      : 'Será validado ao salvar';
}

bot.addEventListener('input', updateBotHelp);
shortcut.addEventListener('focus', () => {
  previousShortcut = currentShortcut;
  shortcut.value = 'Pressione a combinação…';
  window.grokbotSettings.setRecording(true).catch(() => showError());
});
shortcut.addEventListener('keydown', (event) => {
  event.preventDefault();
  if (event.code === 'Escape') {
    currentShortcut = previousShortcut;
    shortcut.blur();
    return;
  }
  const value = acceleratorFromKeyEvent(event);
  if (value !== null) {
    currentShortcut = value;
    shortcut.blur();
  }
});
shortcut.addEventListener('blur', () => {
  shortcut.value = currentShortcut;
  window.grokbotSettings.setRecording(false).catch(() => showError());
});
document.getElementById('restore').addEventListener('click', () => {
  currentShortcut = defaultShortcut;
  shortcut.value = currentShortcut;
});
document.getElementById('close').addEventListener('click', () => window.close());
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  fields.disabled = true;
  try {
    const result = await window.grokbotSettings.save({
      botInput: bot.value, shortcut: currentShortcut, launchAtLogin: launchAtLogin.checked,
    });
    if (!result.ok) {
      showError(result.error);
      return;
    }
    bot.value = result.settings.botId;
    currentShortcut = result.settings.shortcut;
    shortcut.value = currentShortcut;
    launchAtLogin.checked = result.settings.launchAtLogin;
    updateBotHelp();
    status.classList.remove('error');
    status.textContent = 'Configurações salvas.';
  } catch {
    showError();
  } finally {
    fields.disabled = false;
  }
});

window.grokbotSettings.get().then((settings) => {
  bot.value = settings.botId;
  currentShortcut = settings.shortcut;
  defaultShortcut = settings.defaultShortcut;
  shortcut.value = currentShortcut;
  launchAtLogin.checked = settings.launchAtLogin;
  updateBotHelp();
  fields.disabled = false;
}).catch(() => showError());
