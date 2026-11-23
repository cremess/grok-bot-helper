const textarea = document.getElementById('message');
const destination = document.getElementById('destination');
const avatar = document.getElementById('avatar');
const card = document.getElementById('card');
const counter = document.getElementById('counter');
const errorArea = document.getElementById('error');
const send = document.getElementById('send');
const MAX_TEXT_LENGTH = 1000;
const errors = {
  empty: 'Digite uma mensagem.',
  'too-long': 'A mensagem passa de 1000 caracteres.',
  'invalid-bot-id': 'O bot configurado é inválido. Ajuste nas configurações.',
  'open-failed': 'Não foi possível abrir o Grok Bot.',
};
let submitting = false;
let resizeFrame;
let showVersion = 0;

function updateLayout() {
  const length = [...textarea.value].length;
  counter.textContent = `${length}/${MAX_TEXT_LENGTH}`;
  counter.hidden = length < 800;
  counter.classList.toggle('over-limit', length > MAX_TEXT_LENGTH);
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(192, textarea.scrollHeight)}px`;
    window.grokbot.resize(card.offsetHeight + 40).catch(() => {});
  });
}

function showError(message) {
  errorArea.textContent = message;
  errorArea.hidden = !message;
  updateLayout();
}

async function submit() {
  if (submitting) return;
  const version = showVersion;
  submitting = true;
  send.disabled = true;
  showError('');
  try {
    const result = await window.grokbot.submit(textarea.value);
    if (version !== showVersion) return;
    if (result.ok) {
      textarea.value = '';
      send.textContent = 'Enviado ✓';
      send.classList.add('sent');
      updateLayout();
    } else {
      showError(errors[result.error] || 'Erro inesperado.');
      submitting = false;
      send.disabled = false;
    }
  } catch {
    if (version !== showVersion) return;
    showError('Erro inesperado.');
    submitting = false;
    send.disabled = false;
  }
}

send.addEventListener('click', submit);
textarea.addEventListener('input', updateLayout);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    window.grokbot.hide();
  } else if (event.target === textarea && event.key === 'Enter' && !event.shiftKey && event.isComposing === false) {
    event.preventDefault();
    submit();
  }
});

window.grokbot.onShow(({ botId, botName, botColor, botInitial }) => {
  showVersion += 1;
  submitting = false;
  send.disabled = false;
  send.textContent = 'Enviar ↵';
  send.classList.remove('sent');
  destination.textContent = botName || (botId ? `bot ${botId.slice(0, 8)}` : 'bot padrão');
  avatar.textContent = botInitial;
  avatar.style.backgroundColor = botColor;
  showError('');
  card.classList.remove('opening');
  void card.offsetWidth;
  card.classList.add('opening');
  textarea.focus();
  textarea.select();
});
