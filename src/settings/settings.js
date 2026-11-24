applyI18n();
// Language names are shown in their own language, whatever the current locale is.
for (const element of document.querySelectorAll('[data-language-name]')) {
  element.textContent = LANGUAGE_NAMES[element.dataset.languageName] || element.textContent;
}

// Measure the selected label so the pill follows both keyboard and pointer changes.
const segmentedControls = [...document.querySelectorAll('.segmented')];
for (const control of segmentedControls) {
  const indicator = document.createElement('div');
  indicator.className = 'segmented-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  control.prepend(indicator);
  control.addEventListener('change', updateSegments);
}
function updateSegments() {
  for (const control of segmentedControls) {
    const label = control.querySelector('input:checked')?.closest('label');
    if (!label) continue;
    const indicator = control.querySelector('.segmented-indicator');
    indicator.style.width = label.offsetWidth + 'px';
    indicator.style.transform = 'translateX(' + label.offsetLeft + 'px)';
  }
}
const segmentObserver = new ResizeObserver(updateSegments);
for (const control of segmentedControls) segmentObserver.observe(control);

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
const autoUpdate = document.getElementById('auto-update');
const updateStatusLine = document.getElementById('update-status');
const checkUpdate = document.getElementById('check-update');
const restartUpdate = document.getElementById('restart-update');
const updateStateKeys = {
  idle: 'settings.updates.idle',
  checking: 'settings.updates.checking',
  available: 'settings.updates.available',
  downloading: 'settings.updates.downloading',
  downloaded: 'settings.updates.downloaded',
  'up-to-date': 'settings.updates.upToDate',
  error: 'settings.updates.error',
};
let updateStatus;

function renderUpdateStatus() {
  if (!updateStatus) return;
  const { installed, enabled, currentVersion, state, restarting } = updateStatus;
  const stateKey = state === 'idle' && !enabled ? 'settings.updates.off' : updateStateKeys[state];
  updateStatusLine.textContent = installed
    ? t('settings.updates.status', { currentVersion, state: t(stateKey, updateStatus) })
    : t('settings.updates.installedOnly');
  checkUpdate.disabled = !installed || !enabled || !autoUpdate.checked || restarting
    || ['checking', 'available', 'downloading'].includes(state);
  restartUpdate.hidden = state !== 'downloaded';
  restartUpdate.disabled = !installed || restarting;
}

autoUpdate.addEventListener('change', renderUpdateStatus);
checkUpdate.addEventListener('click', () => window.grokbotSettings.checkForUpdates().catch(() => showError()));
restartUpdate.addEventListener('click', () => window.grokbotSettings.restartToUpdate().catch(() => showError()));
window.grokbotSettings.onUpdateStatus((status) => {
  updateStatus = status;
  renderUpdateStatus();
});
window.grokbotSettings.updateStatus().then((status) => {
  if (!updateStatus) updateStatus = status;
  renderUpdateStatus();
}).catch(() => showError());

const themeOptions = [...document.querySelectorAll('input[name="theme"]')];
const languageOptions = [...document.querySelectorAll('input[name="language"]')];
function renderGeneral(settings) {
  notifyOnReply.checked = settings.notifyOnReply;
  autoUpdate.checked = settings.autoUpdate === true;
  renderUpdateStatus();
  for (const option of themeOptions) option.checked = option.value === settings.theme;
  for (const option of languageOptions) option.checked = option.value === settings.language;
  updateSegments();
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
    if (result.ok) { closeClearConfirmation(); showToast(t('settings.history.cleared')); }
    else showError();
  } catch { showError(); }
  finally { event.target.disabled = false; }
});
const afterSendOptions = [...document.querySelectorAll('input[name="after-send"]')];
const afterSendHelp = document.getElementById('after-send-help');
function renderAfterSend(value) {
  if (value) for (const option of afterSendOptions) option.checked = option.value === value;
  updateSegments();
  afterSendHelp.textContent = afterSendOptions.find((option) => option.checked)?.value === 'hide'
    ? t('settings.rows.afterSend.hideHelp')
    : t('settings.rows.afterSend.waitHelp');
}
for (const option of afterSendOptions) option.addEventListener('change', () => renderAfterSend());
const status = document.getElementById('status');

// Where messages go. Grok Bot keeps the Destination section; OpenBot and Hermes have their own fields.
const assistantOptions = [...document.querySelectorAll('input[name="assistant"]')];
const assistantHelp = document.getElementById('assistant-help');
const destinationGroup = document.getElementById('destination-group');
const openbotFields = document.getElementById('openbot-fields');
const openbotAgent = document.getElementById('openbot-agent');
const openbotStatus = document.getElementById('openbot-status');
const openbotHelp = document.getElementById('openbot-help');
const openbotRefresh = document.getElementById('openbot-refresh');
const hermesFields = document.getElementById('hermes-fields');
const hermesPath = document.getElementById('hermes-path');
const hermesNotFound = document.getElementById('hermes-not-found');
const hermesModel = document.getElementById('hermes-model');
const hermesProvider = document.getElementById('hermes-provider');
const hermesContinueRow = document.getElementById('hermes-continue-row');
const hermesContinue = document.getElementById('hermes-continue');
const timeoutRow = document.getElementById('timeout-row');
const replyTimeout = document.getElementById('reply-timeout');
const OPENBOT_STATES = {
  'not-set-up': 'openbot.state.notSetUp',
  'no-agents': 'openbot.state.noAgents',
  unreachable: 'openbot.state.unreachable',
  'not-local': 'openbot.state.notLocal',
  error: 'openbot.state.error',
};
let openbotSelection = { id: '', name: '' };
let openbotResult = { ok: false, state: 'not-set-up', agents: [] };
let openbotRendered = '';
let openbotTimer;
let openbotLoading = false;
let hermesDefaultFound = true;
// Only on the first load with no agent saved, the first agent in the list is suggested. Once the user
// picks something (including "Pick an agent"), it is left alone.
let openbotSuggestFirst = false;

function selectedAssistant() {
  return assistantOptions.find((option) => option.checked)?.value || 'grokbot';
}

function renderHermesNotFound() {
  hermesNotFound.hidden = selectedAssistant() !== 'hermes' || hermesDefaultFound || hermesPath.value.trim() !== '';
}

function renderAssistant(value) {
  if (value) for (const option of assistantOptions) option.checked = option.value === value;
  const assistant = selectedAssistant();
  updateSegments();
  assistantHelp.textContent = t(`settings.assistant.${assistant}Help`);
  destinationGroup.hidden = assistant !== 'grokbot';
  openbotFields.hidden = assistant !== 'openbot';
  hermesFields.hidden = assistant !== 'hermes';
  hermesContinueRow.hidden = assistant !== 'hermes';
  timeoutRow.hidden = assistant === 'grokbot';
  renderHermesNotFound();
  scheduleOpenBotRefresh();
}
for (const option of assistantOptions) option.addEventListener('change', () => renderAssistant());

// Fills the agent list and the status line. The list is rebuilt only when something changed, so the
// automatic refresh doesn't close an open drop-down.
function renderOpenBotAgents(force = false) {
  const agents = openbotResult.ok && Array.isArray(openbotResult.agents) ? openbotResult.agents : [];
  const state = openbotResult.state === 'ready' || Object.hasOwn(OPENBOT_STATES, openbotResult.state) ? openbotResult.state : 'error';
  // With nothing picked yet, the first agent is a good guess; the user can change it before saving.
  if (openbotSuggestFirst && !openbotSelection.id && agents.length) {
    openbotSelection = { id: agents[0].id, name: agents[0].name };
    openbotSuggestFirst = false;
  }
  const key = JSON.stringify([state, openbotSelection.id, agents.map((agent) => [agent.id, agent.name])]);
  if (!force && key === openbotRendered) return;
  openbotRendered = key;
  const missing = Boolean(openbotSelection.id) && !agents.some((agent) => agent.id === openbotSelection.id);
  const options = [new Option(t('settings.openbot.pick'), '')];
  for (const agent of agents) options.push(new Option(agent.name, agent.id));
  if (missing) {
    options.push(new Option(t('settings.openbot.unavailable', { name: openbotSelection.name || openbotSelection.id }), openbotSelection.id));
  }
  openbotAgent.replaceChildren(...options);
  openbotAgent.value = openbotSelection.id;
  const ready = state === 'ready';
  openbotStatus.textContent = ready ? (missing ? t('openbot.agentMissing') : t('settings.openbot.ready')) : t(OPENBOT_STATES[state]);
  openbotStatus.classList.toggle('warning', !ready || missing);
  openbotHelp.hidden = ready && !missing;
}

openbotAgent.addEventListener('change', () => {
  openbotSuggestFirst = false;
  const agent = (openbotResult.agents || []).find((item) => item.id === openbotAgent.value);
  openbotSelection = agent ? { id: agent.id, name: agent.name }
    : openbotAgent.value && openbotAgent.value === openbotSelection.id ? openbotSelection : { id: '', name: '' };
  renderOpenBotAgents();
});

async function loadOpenBotAgents() {
  if (openbotLoading) return;
  openbotLoading = true;
  try {
    const result = await window.grokbotSettings.openbotAgents();
    openbotResult = result && typeof result === 'object' ? result : { ok: false, state: 'error', agents: [] };
  } catch {
    openbotResult = { ok: false, state: 'error', agents: [] };
  } finally {
    openbotLoading = false;
  }
  renderOpenBotAgents();
}

// While OpenBot is the chosen assistant and this window is visible, the list is read again every 3 s,
// so an agent whose Local scripts was just turned on shows up by itself. Nothing runs once it closes.
function scheduleOpenBotRefresh() {
  clearInterval(openbotTimer);
  openbotTimer = undefined;
  if (selectedAssistant() !== 'openbot' || document.hidden) return;
  loadOpenBotAgents();
  openbotTimer = setInterval(loadOpenBotAgents, 3000);
}
document.addEventListener('visibilitychange', scheduleOpenBotRefresh);
openbotRefresh.addEventListener('click', loadOpenBotAgents);
document.getElementById('open-openbot').addEventListener('click', () => {
  window.grokbotSettings.openOpenBot().catch(() => {});
});
hermesPath.addEventListener('input', renderHermesNotFound);

function renderAssistantSettings(settings, { initial = false } = {}) {
  openbotSelection = { id: settings.openbotAgentId || '', name: settings.openbotAgentName || '' };
  openbotSuggestFirst = initial && !openbotSelection.id;
  hermesPath.value = settings.hermesPath || '';
  hermesModel.value = settings.hermesModel || '';
  hermesProvider.value = settings.hermesProvider || '';
  hermesContinue.checked = settings.hermesContinue !== false;
  replyTimeout.value = String(settings.replyTimeoutMinutes || 10);
  renderOpenBotAgents(true);
  renderAssistant(settings.assistant || 'grokbot');
}

async function loadHermesInfo() {
  try {
    const info = await window.grokbotSettings.hermesInfo();
    hermesPath.placeholder = typeof info?.defaultPath === 'string' ? info.defaultPath : '';
    hermesDefaultFound = info?.defaultFound === true;
  } catch {
    hermesDefaultFound = true;
  }
  renderHermesNotFound();
}
const welcomeMode = new URLSearchParams(location.search).get('welcome') === '1';
const welcomeCard = document.getElementById('welcome');
const welcomeMessage = document.getElementById('welcome-message');
let preselectFirstBot = false;
if (welcomeMode) {
  document.body.classList.add('welcome');
  welcomeCard.hidden = false;
  save.textContent = t('settings.saveStart');
}
let bots = [];
let selection = { mode: 'default', botId: '', botName: '' };
let currentShortcut;
let previousShortcut;
let defaultShortcut;
let recording = false;
let toastTimer;

const errors = {
  'invalid-templates': t('settings.errors.templates'),
  'invalid-language': t('settings.errors.language'),
  'invalid-option': t('settings.errors.option'),
  'invalid-bot': t('settings.errors.bot'),
  'invalid-shortcut': t('settings.errors.shortcut'),
  'invalid-after-send': t('settings.errors.afterSend'),
  'shortcut-taken': t('settings.errors.shortcutTaken'),
  'invalid-selection-shortcut': t('settings.errors.selectionShortcut'),
  'selection-shortcut-conflict': t('settings.errors.selectionConflict'),
  'selection-shortcut-taken': t('settings.errors.selectionTaken'),
  'invalid-assistant': t('settings.errors.assistant'),
  'invalid-openbot-agent': t('settings.errors.openbotAgent'),
  'invalid-hermes-path': t('settings.errors.hermesPath'),
  'missing-hermes-path': t('settings.errors.hermesMissing'),
  'invalid-hermes-name': t('settings.errors.hermesName'),
  'invalid-timeout': t('settings.errors.timeout'),
};

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  status.classList.toggle('error', isError);
  status.textContent = message;
  status.hidden = false;
  toastTimer = setTimeout(() => { status.hidden = true; }, 2500);
}

function showError(error) {
  showToast(errors[error] || t('errors.unexpected'), true);
}

function renderKeys(display, value, isRecording, emptyText) {
  display.replaceChildren();
  if (isRecording) {
    display.textContent = t('settings.shortcut.press');
    return;
  }
  if (!value) {
    display.textContent = emptyText;
    return;
  }
  for (const key of value.split('+')) {
    const kbd = document.createElement('kbd');
    kbd.textContent = key;
    display.append(kbd);
  }
}

function renderShortcut() {
  renderWelcome();
  renderKeys(shortcut, currentShortcut, recording, '');
}

// The optional "send selected text" shortcut. Empty means off.
const selectionDisplay = document.getElementById('selection-shortcut');
const selectionRecord = document.getElementById('selection-record');
let currentSelectionShortcut = '';
let previousSelectionShortcut = '';
let recordingSelection = false;

function renderSelectionShortcut() {
  renderKeys(selectionDisplay, currentSelectionShortcut, recordingSelection, t('settings.selection.off'));
}

function stopSelectionRecording() {
  if (!recordingSelection) return;
  recordingSelection = false;
  selectionRecord.classList.remove('recording');
  selectionRecord.textContent = t('settings.shortcut.change');
  renderSelectionShortcut();
  window.grokbotSettings.setRecording(false).catch(() => showError());
}

selectionRecord.addEventListener('click', () => {
  if (recordingSelection) return;
  previousSelectionShortcut = currentSelectionShortcut;
  recordingSelection = true;
  selectionRecord.classList.add('recording');
  selectionRecord.textContent = t('settings.shortcut.recording');
  renderSelectionShortcut();
  window.grokbotSettings.setRecording(true).catch(() => {
    stopSelectionRecording();
    showError();
  });
});
selectionRecord.addEventListener('keydown', (event) => {
  if (!recordingSelection) return;
  if (event.code === 'Tab') {
    stopSelectionRecording();
    return;
  }
  event.preventDefault();
  if (event.code === 'Escape') {
    currentSelectionShortcut = previousSelectionShortcut;
    stopSelectionRecording();
    return;
  }
  const value = acceleratorFromKeyEvent(event);
  if (value !== null) {
    currentSelectionShortcut = value;
    stopSelectionRecording();
  }
});
selectionRecord.addEventListener('blur', stopSelectionRecording);
document.getElementById('selection-clear').addEventListener('click', () => {
  stopSelectionRecording();
  currentSelectionShortcut = '';
  renderSelectionShortcut();
});

function renderWelcome() {
  if (!welcomeMode) return;
  welcomeMessage.replaceChildren();
  if (bots.length === 0) {
    welcomeMessage.textContent = t('settings.welcome.missing');
    return;
  }
  const kbd = document.createElement('kbd');
  kbd.textContent = currentShortcut || '';
  const [before, after] = t('settings.welcome.message').split('{shortcut}');
  welcomeMessage.append(before, kbd, after);
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
  record.textContent = t('settings.shortcut.change');
  renderShortcut();
  window.grokbotSettings.setRecording(false).catch(() => showError());
}

record.addEventListener('click', () => {
  if (recording) return;
  previousShortcut = currentShortcut;
  recording = true;
  record.classList.add('recording');
  record.textContent = t('settings.shortcut.recording');
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

// Templates are edited here and saved with the rest of the settings.
const templateList = document.getElementById('template-list');
const templatesEmpty = document.getElementById('templates-empty');
const templateEditor = document.getElementById('template-editor');
const templateName = document.getElementById('template-name');
const templateText = document.getElementById('template-text');
const addTemplate = document.getElementById('add-template');
let templates = [];
// Index being edited, or -1 for a new template.
let editingTemplate = -1;

function renderTemplates() {
  templateList.replaceChildren();
  templates.forEach((template, index) => {
    const item = document.createElement('li');
    const copy = document.createElement('div');
    copy.className = 'template-copy';
    const name = document.createElement('strong');
    name.textContent = template.name;
    const preview = document.createElement('span');
    preview.textContent = template.text;
    copy.append(name, preview);
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'small';
    edit.textContent = t('settings.templates.editShort');
    edit.setAttribute('aria-label', t('settings.templates.edit', { name: template.name }));
    edit.addEventListener('click', () => openTemplateEditor(index));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button';
    remove.title = t('settings.templates.remove', { name: template.name });
    remove.setAttribute('aria-label', remove.title);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none',
      stroke: 'currentColor', 'aria-hidden': 'true' })) svg.setAttribute(key, String(value));
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'm4 4 8 8M12 4l-8 8');
    svg.append(path);
    remove.append(svg);
    remove.addEventListener('click', () => {
      templates = templates.filter((_, other) => other !== index);
      closeTemplateEditor(false);
      renderTemplates();
      showToast(t('settings.templates.unsaved'));
      addTemplate.focus();
    });
    item.append(copy, edit, remove);
    templateList.append(item);
  });
  templateList.hidden = templates.length === 0;
  templatesEmpty.hidden = templates.length > 0 || !templateEditor.hidden;
  addTemplate.disabled = templates.length >= MAX_TEMPLATES;
}

function openTemplateEditor(index) {
  editingTemplate = index;
  templateName.value = index >= 0 ? templates[index].name : '';
  templateText.value = index >= 0 ? templates[index].text : '';
  templateEditor.hidden = false;
  renderTemplates();
  templateName.focus();
}

function closeTemplateEditor(focusAdd = true) {
  templateEditor.hidden = true;
  editingTemplate = -1;
  renderTemplates();
  if (focusAdd) addTemplate.focus();
}

addTemplate.addEventListener('click', () => openTemplateEditor(-1));
document.getElementById('template-cancel').addEventListener('click', () => closeTemplateEditor());
// Applies the open editor to the list. Returns false (and says why) when the template isn't valid.
function commitTemplateEditor() {
  const template = normalizeTemplate({ name: templateName.value, text: templateText.value });
  if (!template) {
    showToast(t('settings.errors.template'), true);
    (templateName.value.trim() ? templateText : templateName).focus();
    return false;
  }
  if (editingTemplate >= 0) templates = templates.map((item, index) => (index === editingTemplate ? template : item));
  else if (templates.length < MAX_TEMPLATES) templates = [...templates, template];
  return true;
}
document.getElementById('template-done').addEventListener('click', () => {
  if (!commitTemplateEditor()) return;
  closeTemplateEditor();
  showToast(t('settings.templates.unsaved'));
});
templateEditor.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeTemplateEditor();
  }
});

document.getElementById('close').addEventListener('click', () => window.close());
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (fields.disabled) return;
  // A template still open in the editor is saved too, instead of being dropped without a word.
  if (!templateEditor.hidden && (templateName.value.trim() || templateText.value.trim())) {
    if (!commitTemplateEditor()) return;
    closeTemplateEditor(false);
  }
  stopRecording();
  stopSelectionRecording();
  fields.disabled = true;
  save.disabled = true;
  try {
    const result = await window.grokbotSettings.save({
      mode: selection.mode, botId: selection.botId, botName: selection.botName,
      botInput: bot.value, shortcut: currentShortcut, selectionShortcut: currentSelectionShortcut,
      launchAtLogin: launchAtLogin.checked,
      afterSend: afterSendOptions.find((option) => option.checked)?.value,
      notifyOnReply: notifyOnReply.checked,
      autoUpdate: autoUpdate.checked,
      theme: themeOptions.find((option) => option.checked)?.value,
      language: languageOptions.find((option) => option.checked)?.value,
      templates: templates.map(({ name, text }) => ({ name, text })),
      assistant: selectedAssistant(),
      openbotAgentId: openbotSelection.id,
      openbotAgentName: openbotSelection.name,
      hermesPath: hermesPath.value.trim(),
      hermesModel: hermesModel.value.trim(),
      hermesProvider: hermesProvider.value.trim(),
      hermesContinue: hermesContinue.checked,
      replyTimeoutMinutes: replyTimeout.valueAsNumber,
    });
    if (!result.ok) {
      showError(result.error);
      return;
    }
    selectSavedBot(result.settings.botId);
    renderBots();
    currentShortcut = result.settings.shortcut;
    renderShortcut();
    currentSelectionShortcut = result.settings.selectionShortcut;
    renderSelectionShortcut();
    launchAtLogin.checked = result.settings.launchAtLogin;
    renderAfterSend(result.settings.afterSend);
    renderGeneral(result.settings);
    closeTemplateEditor(false);
    templates = result.settings.templates || [];
    renderTemplates();
    renderAssistantSettings(result.settings);
    showToast(t('settings.saved'));
    if (welcomeMode) setTimeout(() => window.close(), 800);
    // The page was localized at load; reload it in the new language once the toast was seen.
    else if (result.localeChanged) setTimeout(() => window.grokbotSettings.reload().catch(() => {}), 700);
  } catch {
    showError();
  } finally {
    fields.disabled = false;
    save.disabled = false;
  }
});

async function initialize() {
  try {
    const [settings] = await Promise.all([window.grokbotSettings.get(), loadBots(), loadHermesInfo()]);
    selectSavedBot(settings.botId);
    preselectFirstBot = welcomeMode && !settings.botId;
    preselectBot();
    renderBots();
    currentShortcut = settings.shortcut;
    defaultShortcut = settings.defaultShortcut;
    renderShortcut();
    currentSelectionShortcut = settings.selectionShortcut || '';
    renderSelectionShortcut();
    launchAtLogin.checked = settings.launchAtLogin;
    renderAfterSend(settings.afterSend);
    renderGeneral(settings);
    templates = Array.isArray(settings.templates) ? settings.templates : [];
    renderTemplates();
    renderAssistantSettings(settings, { initial: true });
    fields.disabled = false;
    save.disabled = false;
  } catch {
    showError();
  }
}
initialize();
