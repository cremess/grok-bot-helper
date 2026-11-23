const textarea = document.getElementById('message');
const destination = document.getElementById('destination');
const counter = document.getElementById('counter');
const errorArea = document.getElementById('error');
const MAX_TEXT_LENGTH = 1000;
const errors = {
  empty: 'Digite uma mensagem.',
  'too-long': 'A mensagem passa de 1000 caracteres.',
  'invalid-bot-id': 'O bot configurado é inválido. Ajuste nas configurações.',
  'open-failed': 'Não foi possível abrir o Grok Bot.',
};
let submitting = false;

function updateCounter() {
  const length = [...textarea.value].length;
  counter.textContent = `${length}/${MAX_TEXT_LENGTH}`;
  counter.classList.toggle('over-limit', length > MAX_TEXT_LENGTH);
}

async function submit() {
  if (submitting) return;
  submitting = true;
  errorArea.textContent = '';
  try {
    const result = await window.grokbot.submit(textarea.value);
    if (result.ok) {
      textarea.value = '';
      updateCounter();
    } else {
      errorArea.textContent = errors[result.error] || 'Erro inesperado.';
    }
  } catch {
    errorArea.textContent = 'Erro inesperado.';
  } finally {
    submitting = false;
  }
}

textarea.addEventListener('input', updateCounter);
textarea.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    window.grokbot.hide();
  } else if (event.key === 'Enter' && !event.shiftKey && event.isComposing === false) {
    event.preventDefault();
    submit();
  }
});

window.grokbot.onShow(({ botId }) => {
  destination.textContent = botId ? `Destino: bot ${botId}` : 'Destino: bot padrão do Grok Bot';
  errorArea.textContent = '';
  textarea.focus();
  textarea.select();
});
