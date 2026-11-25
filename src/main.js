const { t, setLocale, getLocale, resolveLocale } = require('./lib/i18n');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeTheme, screen, shell, Tray, clipboard, Notification } = require('electron');
const { migrateUserData } = require('./lib/migrate');
const appData = app.getPath('appData');
const userData = path.join(appData, 'grok-bot-helper');
migrateUserData(path.join(appData, 'grokbot-assistant'), userData);
app.setPath('userData', userData);
const { createTrayIcon, appIconPath } = require('./icon');
const { buildPromptLink, parseBotId, isValidBotId, MAX_TEXT_LENGTH, MAX_PARTS, splitMessage } = require('./lib/link');
const { clipSelection, selectionPollDecision, restorePlan } = require('./lib/selection');
const { readPromptConfirmDismissed, AUTO_SEND_EXIT } = require('./lib/composer');
const { listBots } = require('./lib/roster');
const { loadHistory, addToHistory, saveHistory } = require('./lib/history');
const { readConversation, recentExchanges, latestReply, replyState, resolveAgentId, trackTranscriptChange,
  waitDecision, grokWaitPhase, NOT_DELIVERED_MS } = require('./lib/transcript');
const { readUsage, isBlocked, formatReset } = require('./lib/usage');
const { avatarColor, avatarInitial } = require('./lib/avatar');
const { loadSettings, saveSettings, isValidShortcut, canonicalShortcut, selectionShortcutError, DEFAULT_SETTINGS, LANGUAGES } = require('./lib/settings');
const { promptPosition, isBoundsVisible } = require('./lib/position');
const { pickShortcut, isFirstRun } = require('./lib/first-run');
const { validateTemplates } = require('./lib/templates');
const { isLoopbackFeed } = require('./lib/update');
const { isAssistant, isValidReplyTimeout, textLimit, validateAssistantText, replyTimeoutMs, conversationKey, addEntry,
  conversationFromLog, createTurnRegistry } = require('./lib/assistant');
const { OPENBOT_APP_URL, automationDirectory, createOpenBotClient, isValidAgentId, openBotState,
  runOpenBotTurn } = require('./lib/openbot-client');
const { defaultHermesPath, hermesPathError, isValidHermesName, buildHermesArgs, runHermes,
  killProcessTreeSync } = require('./lib/hermes-client');

// Keep the tray icon alive while the app runs.
let tray;
let promptWindow;
let settingsWindow;
let settings;
let registeredShortcut;
let registeredSelectionShortcut;
const warnedShortcutAccelerators = new Set();
let capturingSelection = false;
const FIRST_UPDATE_DELAY_MS = 30 * 1000;
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
let updater;
let updateStatus = { state: 'idle' };
let readyUpdateVersion;
let updateCheckRunning = false;
let updateTimer;
let updateInterval;
let quittingForUpdate = false;
const notifiedUpdateVersions = new Set();
// A long message being sent in parts: { cancelled, part, total }.
let partsJob;
let singleSend;
const settingsLocation = {};
const GROK_BOT_DIRECTORY = path.join(app.getPath('appData'), 'Grok Bot', 'sand-client-persistence');
// OpenBot's local API. The client reads the address and token from OpenBot's automation folder when it
// needs them and keeps the token to itself (see lib/openbot-client.js).
const openBotClient = createOpenBotClient({ directory: automationDirectory(app.getPath('appData')) });
const HERMES_DEFAULT_PATH = defaultHermesPath(process.env.LOCALAPPDATA);
// OpenBot and Hermes: the message each conversation is waiting on, the last problem, and the messages of
// this run of the app. All of it stays in memory; conversations are never written to disk.
const assistantTurns = createTurnRegistry();
const assistantFailures = new Map();
const assistantLogs = new Map();
let hideTimer;
let sendingPrompt = false;
// How long after sending the prompt closes with "Close and notify".
const HIDE_DELAY_MS = 280;
let pending;
let responsePoll;
let deliveryFailure;
let failedRequest;
// Keep a reference so Windows doesn't garbage-collect the notification before it's clicked.
let lastNotification;
const historyFile = path.join(app.getPath('userData'), 'history.json');
let history = [];
let pinned = false;
let settingPromptBounds = false;
let userChangingBounds = false;
let boundsSaveTimer;
let autoHeight = 160;

function setPromptBounds(bounds) {
  settingPromptBounds = true;
  try { promptWindow.setBounds(bounds); }
  finally { settingPromptBounds = false; }
}

function positionPrompt() {
  const saved = settings.promptBounds;
  if (isBoundsVisible(saved, screen.getAllDisplays().map((display) => display.workArea))) {
    setPromptBounds(saved);
    return;
  }
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const size = { width: saved?.width || 680, height: saved?.height || autoHeight };
  setPromptBounds({ ...size, ...promptPosition(workArea, size) });
}

function resetPromptBounds() {
  clearTimeout(boundsSaveTimer);
  userChangingBounds = false;
  settings = saveSettings(settingsLocation.path, { ...settings, promptBounds: null });
  positionPrompt();
  promptWindow.webContents.send('prompt:user-sized', false);
  promptWindow.webContents.send('prompt:bounds-reset');
}

function rememberPromptBounds() {
  if (settingPromptBounds || !userChangingBounds) return;
  userChangingBounds = false;
  settings.promptBounds = promptWindow.getBounds();
  clearTimeout(boundsSaveTimer);
  boundsSaveTimer = setTimeout(() => {
    try { settings = saveSettings(settingsLocation.path, settings); }
    catch { /* Keep bounds in memory if saving fails. */ }
    promptWindow.webContents.send('prompt:user-sized', Boolean(settings.promptBounds));
  }, 400);
}

function usesGrokBot() {
  return settings.assistant === 'grokbot';
}

function assistantName() {
  if (settings.assistant === 'hermes') return 'Hermes';
  return settings.openbotAgentName
    || (settings.openbotAgentId ? t('bot.fallback', { id: settings.openbotAgentId.slice(0, 8) }) : 'OpenBot');
}

function botDetails() {
  const maxLength = textLimit(settings.assistant);
  if (settings.assistant === 'openbot') {
    const name = assistantName();
    return { assistant: 'openbot', maxLength, botId: settings.openbotAgentId, botName: name,
      botColor: avatarColor(undefined, settings.openbotAgentId || 'openbot'), botInitial: avatarInitial(name) };
  }
  if (settings.assistant === 'hermes') {
    return { assistant: 'hermes', maxLength, botId: 'hermes', botName: 'Hermes', botColor: avatarColor('purple'), botInitial: 'H' };
  }
  const roster = listBots(GROK_BOT_DIRECTORY);
  const agentId = resolveAgentId(GROK_BOT_DIRECTORY, settings.botId);
  const bot = roster.ok ? roster.bots.find((item) => item.id === agentId) : undefined;
  const botName = settings.botName || bot?.name || (settings.botId ? '' : 'Grok Bot');
  return { assistant: 'grokbot', maxLength, botId: settings.botId, botName,
    // With "Grok Bot default" the avatar follows the bot it resolves to, so it matches the name shown.
    botColor: bot || settings.botId ? avatarColor(bot?.color, agentId || settings.botId) : '#1080f3',
    botInitial: bot || settings.botId ? avatarInitial(botName) : 'G' };
}

// The OpenBot agents with Local scripts on, with avatars, and the state the UI explains when there are none.
async function openBotAgents() {
  const result = await openBotClient.listAgents();
  return { ok: result.ok, state: openBotState(result), agents: result.ok ? result.agents.map((agent) => ({
    ...agent, avatar: { color: avatarColor(undefined, agent.id), initial: avatarInitial(agent.name) },
  })) : [] };
}

// Brings OpenBot up so the user can answer an agent or turn on Local scripts. Only this fixed link.
function openOpenBot() {
  return shell.openExternal(OPENBOT_APP_URL).then(() => ({ ok: true }), () => ({ ok: false }));
}

function updateSettingsBackground() {
  if (promptWindow && !promptWindow.isDestroyed()) {
    promptWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1c1c20' : '#fafafc');
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1b1b1f' : '#f6f6f8');
  }
}

function resetDestination() {
  clearTimeout(hideTimer);
  sendingPrompt = false;
  // Stop a pending composer check before switching destinations.
  singleSend?.abort();
  if (partsJob) {
    partsJob.cancelled = true;
    partsJob.controller.abort();
  }
  stopWaiting();
  deliveryFailure = undefined;
  clearUnread();
  updateAlwaysOnTop();
  promptWindow.webContents.send('prompt:conversation', { ...loadConversation(), waiting: false, ...assistantState(),
    usage: usesGrokBot() ? usageDetails() : {}, bot: botDetails() });
}

function conversationFrom(result) {
  return result.ok ? { ok: true, entries: recentExchanges(result.entries, 6), latest: latestReply(result.entries) }
    : { ok: false };
}

function loadConversation() {
  if (!usesGrokBot()) return conversationFromLog(assistantLogs.get(conversationKey(settings)));
  return conversationFrom(readConversation(GROK_BOT_DIRECTORY, settings.botId));
}

// The turn of the conversation on screen, when OpenBot or Hermes is the destination (not a stopped one).
function currentAssistantJob() {
  const key = usesGrokBot() ? null : conversationKey(settings);
  return key ? assistantTurns.active(key) : undefined;
}

// True while the prompt waits in place for a reply (After sending: Wait for reply). It then stops being
// always on top, so the user can work in other windows meanwhile.
function waitingInPlace() {
  return pending?.mode === 'wait' || currentAssistantJob()?.mode === 'wait';
}

function updateAlwaysOnTop() {
  if (promptWindow && !promptWindow.isDestroyed()) promptWindow.setAlwaysOnTop(pinned || !waitingInPlace());
}

const OPENBOT_SEND_ERRORS = {
  'not-set-up': 'openbot-not-set-up',
  unreachable: 'openbot-unreachable',
  'not-local': 'openbot-not-local',
  'invalid-url': 'openbot-not-local',
  'not-found': 'openbot-agent-missing',
  forbidden: 'openbot-agent-missing',
  'invalid-agent': 'openbot-agent-missing',
};

// What the prompt shows for a failed OpenBot or Hermes turn, in the current language.
function failureView({ error, detail, code, name }) {
  const openOpenBot = ['needs-person', 'openbot-not-set-up', 'openbot-unreachable', 'openbot-agent-missing', 'openbot-timeout']
    .includes(error);
  const steps = error === 'openbot-not-set-up' || error === 'openbot-agent-missing';
  const messages = {
    'needs-person': () => t('prompt.openbot.needsPerson', { bot: name }),
    'openbot-timeout': () => t('prompt.openbot.timeout', { bot: name }),
    'openbot-not-set-up': () => t('openbot.state.notSetUp'),
    'openbot-unreachable': () => t('openbot.state.unreachable'),
    'openbot-not-local': () => t('openbot.state.notLocal'),
    'openbot-agent-missing': () => t('openbot.agentMissing'),
    'hermes-timeout': () => t('prompt.hermes.timeout'),
    'hermes-exit': () => t('prompt.hermes.failed', { code }),
    'hermes-not-started': () => t('prompt.hermes.notStarted'),
  };
  const message = Object.hasOwn(messages, error) ? messages[error]() : t('prompt.assistant.failed', { bot: name });
  return { message, detail: typeof detail === 'string' ? detail : '', steps, openOpenBot,
    retry: error !== 'needs-person' && error !== 'openbot-timeout' };
}

// Waiting and failure details for the prompt, for the conversation on screen. Empty for Grok Bot.
function assistantState() {
  if (usesGrokBot()) return {};
  const key = conversationKey(settings);
  const job = key && assistantTurns.active(key);
  if (job) return { waiting: true, sent: job.sent };
  const failure = key && assistantFailures.get(key);
  if (failure) return { waiting: false, assistantError: failureView(failure), sent: failure.sent };
  return { waiting: false };
}

function finishedError(job, result) {
  if (job.assistant === 'hermes') {
    if (result.error === 'timeout') return { error: 'hermes-timeout' };
    if (result.error === 'exit') return { error: 'hermes-exit', code: result.code, detail: result.detail };
    return { error: 'hermes-not-started' };
  }
  if (result.error === 'needs-person') return { error: 'needs-person' };
  if (result.error === 'timeout') return { error: 'openbot-timeout' };
  if (result.error === 'failed') return { error: 'openbot-failed', detail: result.detail || result.status };
  return { error: OPENBOT_SEND_ERRORS[result.error] || 'openbot-failed', detail: result.detail };
}

function isOnScreen(key) {
  return !usesGrokBot() && conversationKey(settings) === key;
}

function sendAssistantConversation(key) {
  if (!promptWindow || promptWindow.isDestroyed() || !isOnScreen(key)) return;
  updateAlwaysOnTop();
  promptWindow.webContents.send('prompt:conversation', { ...loadConversation(), ...assistantState() });
}

// Marks the tray (and notifies, if enabled) for a finished turn the user can't see right now.
function notifyAssistantOutcome(job) {
  if (!promptWindow || promptWindow.isDestroyed()) return;
  if (promptWindow.isVisible() && isOnScreen(job.key)) return;
  if (job.reply) {
    notifyReply(job.name, job.reply);
    return;
  }
  tray.setImage(createTrayIcon({ unread: true }));
  if (job.failure.error === 'needs-person') {
    setTrayTooltip('tray.needsPerson', { name: job.name });
    showNotification(job.name, t('prompt.openbot.needsPerson', { bot: job.name }));
  } else {
    setTrayTooltip('tray.assistantFailed', { name: job.name });
  }
}

// Records how an OpenBot or Hermes turn ended and shows it, or marks the tray when the prompt is closed.
// Only now is the conversation free for the next message.
function finishAssistantJob(job, result) {
  if (!assistantTurns.release(job.key, job)) return;
  // A stopped turn recorded its message when Stop was pressed; there is nothing else to show.
  if (job.cancelled) {
    sendAssistantConversation(job.key);
    return;
  }
  let log = addEntry(assistantLogs.get(job.key), job.sent);
  if (result.ok) {
    job.reply = (result.answer || t('prompt.assistant.noText', { bot: job.name })) + (result.clipped ? '\n\n…' : '');
    log = addEntry(log, { role: 'bot', text: job.reply, timestampMs: Date.now() });
  } else {
    job.failure = { ...finishedError(job, result), name: job.name, sent: job.sent };
    assistantFailures.set(job.key, job.failure);
  }
  assistantLogs.set(job.key, log);
  sendAssistantConversation(job.key);
  // With "Close and notify" the prompt hides a moment after sending. Decide once that happened, so a reply
  // or failure that comes back right away (Hermes failing to start, say) still marks the tray.
  if (job.mode === 'hide') setTimeout(() => notifyAssistantOutcome(job), HIDE_DELAY_MS + 120);
  else notifyAssistantOutcome(job);
}

// Sends the prompt text to OpenBot or Hermes. Problems found before anything is sent come back as an
// error for the prompt; after that, the reply (or what went wrong) arrives as a conversation update.
async function submitToAssistant(payload) {
  const text = typeof payload === 'string' ? payload : payload?.text;
  const valid = validateAssistantText(text);
  if (!valid.ok) return valid;
  const key = conversationKey(settings);
  if (!key) return { ok: false, error: 'no-agent' };
  const job = { key, assistant: settings.assistant, name: assistantName(), mode: settings.afterSend, phase: 'sending',
    sent: { role: 'user', text: valid.text, timestampMs: Date.now() }, cancelled: false, controller: new AbortController() };
  // Registered before anything is sent, so Stop works from the start and a second message to the same
  // conversation is refused until this one ended (closing or reopening the prompt doesn't change that).
  if (!assistantTurns.start(key, job)) return { ok: false, error: 'busy' };
  const timeoutMs = replyTimeoutMs(settings.replyTimeoutMinutes);
  let turn;
  try {
    if (job.assistant === 'hermes') {
      const executable = settings.hermesPath || HERMES_DEFAULT_PATH;
      if (!executable || hermesPathError(executable)) {
        assistantTurns.release(key, job);
        return { ok: false, error: 'hermes-missing' };
      }
      turn = runHermes({ executable, input: valid.text, timeoutMs, signal: job.controller.signal,
        onSpawn: (child) => { job.child = child; },
        args: buildHermesArgs({ model: settings.hermesModel, provider: settings.hermesProvider,
          continueSession: settings.hermesContinue }) });
    } else {
      // Show the message going out right away; then wait until OpenBot queued it, so a setup problem shows
      // as an error instead of a long wait.
      sendAssistantConversation(key);
      let markQueued;
      const queued = new Promise((resolve) => { markQueued = resolve; });
      turn = runOpenBotTurn({ client: openBotClient, agentId: settings.openbotAgentId, text: valid.text, timeoutMs,
        signal: job.controller.signal, onQueued: () => markQueued({ ok: true }) });
      const first = await Promise.race([queued, turn]);
      if (!first.ok || job.cancelled) {
        turn.catch(() => {});
        assistantTurns.release(key, job);
        sendAssistantConversation(key);
        return { ok: false, error: job.cancelled ? 'openbot-stopped' : OPENBOT_SEND_ERRORS[first.error] || 'openbot-failed' };
      }
    }
  } catch {
    assistantTurns.release(key, job);
    sendAssistantConversation(key);
    return { ok: false, error: 'unexpected' };
  }
  job.phase = 'waiting';
  assistantFailures.delete(key);
  history = addToHistory(history, text);
  try { saveHistory(historyFile, history); } catch { /* Sending already succeeded; keep history in memory. */ }
  turn.then((result) => finishAssistantJob(job, result), () => finishAssistantJob(job, { ok: false, error: 'unexpected' }));
  if (isOnScreen(key)) {
    clearUnread();
    sendAssistantConversation(key);
    if (job.mode === 'hide') {
      clearTimeout(hideTimer);
      sendingPrompt = true;
      hideTimer = setTimeout(() => {
        sendingPrompt = false;
        promptWindow.hide();
      }, HIDE_DELAY_MS);
    }
  }
  return { ok: true, afterSend: job.mode };
}

// Stops waiting for the conversation on screen. Hermes is stopped; an OpenBot agent keeps working and
// its answer can still be read in OpenBot. The conversation stays busy until the turn really ended (for
// Hermes, until the process exited), so two Hermes runs never share its session.
function stopAssistantJob() {
  const job = currentAssistantJob();
  if (!job) return;
  job.cancelled = true;
  job.controller.abort();
  // Once sent, the message is part of the conversation even without an answer.
  if (job.phase === 'waiting') assistantLogs.set(job.key, addEntry(assistantLogs.get(job.key), job.sent));
  updateAlwaysOnTop();
}

// When the app quits: stop every turn and end any Hermes process right away.
function stopAllAssistantJobs() {
  for (const job of assistantTurns.all()) {
    job.cancelled = true;
    if (job.child) killProcessTreeSync(job.child);
    job.controller.abort();
  }
}

// Entry ids present before sending, so only entries written after the send count as the answer.
// The agent is pinned here: with the default bot, Grok Bot's last-used agent could change while we
// wait, and reading another agent's transcript against this baseline would show its old reply.
function conversationBaseline(botId) {
  const agentId = resolveAgentId(GROK_BOT_DIRECTORY, botId) || botId;
  const result = readConversation(GROK_BOT_DIRECTORY, agentId);
  if (result.ok) {
    return { agentId, knownIds: new Set(result.entries.map((entry) => entry.id)),
      knownUntilMs: result.entries.reduce((max, entry) => Math.max(max, entry.timestampMs), 0) };
  }
  return { agentId, knownIds: result.error === 'not-found' ? new Set() : undefined, knownUntilMs: 0 };
}

function sentState(request, entries) {
  return replyState(entries, { knownIds: request.knownIds, knownUntilMs: request.knownUntilMs,
    afterMs: request.sentAt - 2000, expectPrefix: request.expectPrefix });
}

// Reads the baseline for the next part. Right after Grok Bot wrote the previous part the file may be
// caught mid-write; without a baseline, delivery would fall back to timestamps and the previous part's
// entry could pass for this one, so retry a few times.
async function partBaseline(botId) {
  let baseline = conversationBaseline(botId);
  for (let attempt = 0; attempt < 5 && !(baseline.knownIds instanceof Set); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    baseline = conversationBaseline(botId);
  }
  return baseline;
}

// Pace confirmed sends and poll for manual delivery before advancing to the next part.
async function runParts({ text, parts, links, job }) {
  const botId = settings.botId;
  const mode = settings.afterSend;
  const { autoSend, total } = job;
  let request;
  try {
    for (let index = 0; index < total; index += 1) {
      if (job.cancelled || settings.botId !== botId) return { ok: false, error: 'cancelled', sentParts: index, total };
      job.part = index + 1;
      job.manualSend = !autoSend;
      promptWindow.webContents.send('prompt:parts-progress', { part: job.part, total, manualSend: job.manualSend });
      const baseline = await partBaseline(botId);
      // partBaseline can take up to a second; recheck before handing the part to Grok Bot.
      if (job.cancelled || !usesGrokBot() || settings.botId !== botId) {
        return { ok: false, error: 'cancelled', sentParts: index, total };
      }
      request = { sentAt: Date.now(), botId, mode, autoSend, ...baseline, expectPrefix: `(${index + 1}/${total})`,
        sent: { role: 'user', text: parts[index], timestampMs: Date.now() } };
      try {
        await shell.openExternal(links[index].url);
      } catch {
        return { ok: false, error: 'part-failed', part: job.part, total };
      }
      const failure = await sendComposer(request, job.controller.signal);
      if (job.cancelled) return { ok: false, error: 'cancelled', sentParts: index, total, pendingPart: job.part };
      if (failure) return failure;
      if (index === 0) {
        history = addToHistory(history, text);
        try { saveHistory(historyFile, history); } catch { /* Keep history in memory. */ }
      }
      if (autoSend && !request.delivered) {
        job.manualSend = true;
        promptWindow.webContents.send('prompt:parts-progress', { part: job.part, total, manualSend: true });
      }
      const delivered = request.delivered || await waitForDelivery(request, job);
      // The part was already handed to Grok Bot; if its confirmation is still open it can still arrive.
      if (job.cancelled) return { ok: false, error: 'cancelled', sentParts: index, total, pendingPart: job.part };
      if (!delivered) return { ok: false, error: 'part-failed', part: job.part, total };
      if (index + 1 < total) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  } finally {
    partsJob = undefined;
  }
  if (!usesGrokBot() || request.botId !== settings.botId) return { ok: true, afterSend: mode, total };
  // Every part arrived; wait for the reply to the last one as for a single message.
  request.delivered = true;
  startWaiting(request);
  if (mode === 'hide') {
    clearTimeout(hideTimer);
    sendingPrompt = true;
    hideTimer = setTimeout(() => {
      sendingPrompt = false;
      promptWindow.hide();
    }, 280);
  }
  return { ok: true, afterSend: mode, total };
}

// Polls the transcript until the message of `request` shows up, the job is cancelled or delivery times out.
function waitForDelivery(request, job) {
  return new Promise((resolve) => {
    const check = () => {
      if (job.cancelled) return resolve(false);
      const result = readConversation(GROK_BOT_DIRECTORY, request.agentId);
      if (result.ok && sentState(request, result.entries).delivered) return resolve(true);
      if (Date.now() - request.waitStartedAt >= NOT_DELIVERED_MS) return resolve(false);
      setTimeout(check, 500);
    };
    setTimeout(check, 500);
  });
}

function usageDetails() {
  const usage = readUsage(GROK_BOT_DIRECTORY);
  const now = Date.now();
  return { blocked: isBlocked(usage, now), percentUsed: usage.ok ? usage.percentUsed : null,
    resetText: formatReset(usage.ok ? usage.nextResetMs : null, now) };
}

// Remembers the tooltip's key so a language change can show the same tooltip in the new language.
let trayTooltip = { key: 'app.name', params: {} };
function setTrayTooltip(key, params = {}) {
  trayTooltip = { key, params };
  tray.setToolTip(t(key, params));
}

function clearUnread() {
  tray.setImage(createTrayIcon());
  setTrayTooltip('app.name');
}

function stopWaiting() {
  clearInterval(responsePoll);
  responsePoll = undefined;
  pending = undefined;
  if (promptWindow && !promptWindow.isDestroyed()) promptWindow.setAlwaysOnTop(true);
}

function startWaiting(request) {
  stopWaiting();
  deliveryFailure = undefined;
  pending = request;
  pending.waitPhase = grokWaitPhase(pending);
  if (pending.mode === 'wait' && !pinned) promptWindow.setAlwaysOnTop(false);
  promptWindow.webContents.send('prompt:conversation', {
    ...loadConversation(), waiting: true, sent: pending.sent, waitPhase: pending.waitPhase,
  });
  responsePoll = setInterval(() => {
    const result = readConversation(GROK_BOT_DIRECTORY, pending.agentId);
    const state = result.ok ? sentState(pending, result.entries) : { delivered: false, reply: null };
    const now = Date.now();
    pending.delivered = pending.delivered || state.delivered;
    // Keep the last reply seen: a read caught while Grok Bot rewrites entries shouldn't lose it.
    if (state.reply) pending.reply = state.reply;
    pending.watch = trackTranscriptChange(pending.watch, result, now);
    const elapsed = now - pending.waitStartedAt;
    const status = waitDecision({ delivered: pending.delivered, hasReply: Boolean(pending.reply),
      elapsedMs: elapsed, quietMs: now - pending.watch.changedAt });
    if (status === 'settling') {
      // Show each new message as it lands, but keep waiting in case the bot sends more.
      const key = state.reply ? `${state.reply.id}\n${state.reply.text}` : pending.replyKey;
      if (result.ok && key !== pending.replyKey) {
        pending.replyKey = key;
        promptWindow.webContents.send('prompt:conversation', {
          ...conversationFrom(result), waiting: true, partial: true, sent: pending.sent,
        });
      }
      return;
    }
    const reply = status === 'replied' ? pending.reply : null;
    const notDelivered = status === 'not-delivered';
    if (status === 'waiting') {
      const phase = grokWaitPhase(pending, now);
      if (pending.waitPhase !== phase) {
        pending.waitPhase = phase;
        promptWindow.webContents.send('prompt:conversation', {
          ...loadConversation(), waiting: true, sent: pending.sent, waitPhase: phase,
        });
      }
      return;
    }
    const request = pending;
    stopWaiting();
    if (notDelivered) {
      deliveryFailure = { notDelivered: true, sent: request.sent };
      failedRequest = request;
    }
    // Reuse the read that found the reply; a second read could catch Grok Bot mid-write.
    promptWindow.webContents.send('prompt:conversation', {
      ...(result.ok ? conversationFrom(result) : loadConversation()), waiting: false, timedOut: !reply && !notDelivered,
      notDelivered, sent: notDelivered ? request.sent : undefined, usage: usageDetails(),
    });
    if (notDelivered && request.mode === 'hide' && !promptWindow.isVisible()) {
      tray.setImage(createTrayIcon({ unread: true }));
      setTrayTooltip('tray.deliveryFailed');
    }
    if (reply && !promptWindow.isVisible()) {
      const roster = listBots(GROK_BOT_DIRECTORY);
      const name = settings.botName || (roster.ok && roster.bots.find((bot) => bot.id === request.agentId)?.name)
        || (settings.botId ? t('bot.fallback', { id: settings.botId.slice(0, 8) }) : 'Grok Bot');
      notifyReply(name, reply.text);
    }
  }, 1000);
}

// Marks the tray for a reply that arrived with the prompt closed and, if enabled, shows a notification.
function notifyReply(name, text) {
  tray.setImage(createTrayIcon({ unread: true }));
  setTrayTooltip('tray.newReply', { name });
  showNotification(name, text);
}

function showNotification(name, text) {
  if (!settings.notifyOnReply || !Notification.isSupported()) return;
  const notification = new Notification({ title: name,
    body: [...text.replace(/[*`#]/g, '')].slice(0, 140).join(''),
    silent: false, icon: appIconPath() });
  notification.on('click', () => {
    if (!promptWindow.isVisible()) togglePrompt();
    else { clearUnread(); promptWindow.focus(); }
  });
  lastNotification = notification;
  notification.show();
}

function openSettings({ welcome = false } = {}) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    icon: appIconPath(),
    width: 560,
    height: 820,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: t('settings.windowTitle'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1b1f' : '#f6f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWindow.setMenu(null);
  if (welcome) settingsWindow.setSize(560, 920);
  settingsWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWindow.on('closed', () => {
    settingsWindow = undefined;
    if (quittingForUpdate) return;
    applyShortcut(settings.shortcut);
    applySelectionShortcut(settings.selectionShortcut);
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings', 'settings.html'), {
    query: welcome ? { welcome: '1', locale: getLocale() } : { locale: getLocale() },
  });
}

function togglePrompt() {
  if (!promptWindow) return;
  clearTimeout(hideTimer);
  sendingPrompt = false;
  if (promptWindow.isVisible()) {
    promptWindow.hide();
    return;
  }
  showPrompt();
}

function showPrompt(extra = {}) {
  clearTimeout(hideTimer);
  sendingPrompt = false;
  // A slow confirmation in Grok Bot can deliver the message after we gave up waiting;
  // drop the stale failure so "Try again" doesn't send it twice.
  if (deliveryFailure && failedRequest) {
    const result = readConversation(GROK_BOT_DIRECTORY, failedRequest.agentId);
    if (result.ok && sentState(failedRequest, result.entries).delivered) {
      deliveryFailure = undefined;
      failedRequest = undefined;
    }
  }
  positionPrompt();
  clearUnread();
  promptWindow.show();
  promptWindow.focus();
  const grokBot = usesGrokBot();
  promptWindow.webContents.send('prompt:show', {
    history,
    pinned,
    userSized: Boolean(settings.promptBounds),
    ...botDetails(),
    conversation: loadConversation(), waiting: Boolean(pending), partial: Boolean(pending?.reply), sent: pending?.sent,
    ...(grokBot ? deliveryFailure : assistantState()),
    waitPhase: grokWaitPhase(pending),
    parts: partsJob ? { part: partsJob.part, total: partsJob.total, manualSend: partsJob.manualSend } : undefined,
    templates: settings.templates,
    // Grok Bot's usage limit doesn't apply to OpenBot or Hermes.
    usage: grokBot ? usageDetails() : {},
    ...extra,
  });
}

// Simulates Ctrl+C in the focused app with PowerShell and .NET SendKeys, which ship with Windows, so no
// native module or new dependency is needed. The command line is a fixed string: no user text, clipboard
// content or setting is ever put on it. It first waits (up to 1 s) for Ctrl, Shift and Alt from the
// shortcut to be released, otherwise the app would receive Ctrl+Alt+C instead of Ctrl+C.
// In a terminal (cmd, PowerShell, Windows Terminal, mintty) Ctrl+C interrupts the running program, so the
// command checks the focused window's class and exits with code 3 instead of sending the keys.
const TERMINAL_EXIT_CODE = 3;
const COPY_COMMAND = [
  'Add-Type -AssemblyName System.Windows.Forms',
  "Add-Type -Namespace GrokBotHelper -Name Win -MemberDefinition '[DllImport(\"user32.dll\")] public static extern System.IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\", CharSet = CharSet.Unicode)] public static extern int GetClassName(System.IntPtr hWnd, System.Text.StringBuilder name, int max);'",
  '$deadline = [DateTime]::UtcNow.AddMilliseconds(1000)',
  "while ([System.Windows.Forms.Control]::ModifierKeys -ne 'None' -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 20 }",
  '$name = New-Object System.Text.StringBuilder 256',
  '[void][GrokBotHelper.Win]::GetClassName([GrokBotHelper.Win]::GetForegroundWindow(), $name, 256)',
  `if (@('ConsoleWindowClass', 'CASCADIA_HOSTING_WINDOW_CLASS', 'mintty', 'VirtualConsoleClass') -contains $name.ToString()) { exit ${TERMINAL_EXIT_CODE} }`,
  "[System.Windows.Forms.SendKeys]::SendWait('^c')",
].join('; ');

function pressCopy() {
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve, reject) => {
    execFile(powershell, ['-NoProfile', '-NonInteractive', '-Command', COPY_COMMAND],
      { windowsHide: true, timeout: 4000 }, (error) => (error ? reject(error) : resolve()));
  });
}

// Keep the command fixed and pass the expected draft only through stdin. Invoke the send
// button in the same Grok Bot window only after verifying the composer text twice.
const AUTO_SEND_COMMAND = String.raw`& {
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
# Match JavaScript's trim whitespace, including BOM and excluding U+0085.
$trimChars = [char[]](@(9..13) + @(32,160,5760) + @(8192..8202) + @(8232,8233,8239,8287,12288,65279))
function Normalize([string]$value) {
  $lines = $value.Replace([char]160, [char]32) -split '\r\n?|\n'
  return (($lines.ForEach({ $_.TrimEnd($trimChars) }) -join [char]10).Trim($trimChars))
}
$expected = Normalize ([Console]::In.ReadToEnd())
if (!$expected) { exit ${AUTO_SEND_EXIT.noComposer} }
$seconds = if ($args.Count) { [int]$args[0] } else { 8 }
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$children = [System.Windows.Automation.TreeScope]::Children
$descendants = [System.Windows.Automation.TreeScope]::Descendants
$controlType = [System.Windows.Automation.AutomationElement]::ControlTypeProperty
$editCondition = [System.Windows.Automation.PropertyCondition]::new($controlType, [System.Windows.Automation.ControlType]::Edit)
$buttonCondition = [System.Windows.Automation.PropertyCondition]::new($controlType, [System.Windows.Automation.ControlType]::Button)
function ComposerText($element) {
  $pattern = $null
  if ($element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) {
    return Normalize ($pattern.DocumentRange.GetText(-1))
  }
  if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
    return Normalize $pattern.Current.Value
  }
}
function ConfirmSend($composer, $button) {
  # Sent when the composer no longer holds our text or the button stopped being a send action.
  # (An empty composer may read as '', "\n" or even the field's accessible name, so don't require '').
  $confirmation = [Diagnostics.Stopwatch]::StartNew()
  while ($confirmation.ElapsedMilliseconds -lt 3000) {
    try {
      if (![string]::Equals((ComposerText $composer), $expected, [StringComparison]::Ordinal)) { exit ${AUTO_SEND_EXIT.sent} }
      if ($button.Current.Name -notmatch '^(enviar|send)( message| mensagem)?$') { exit ${AUTO_SEND_EXIT.sent} }
    } catch {
      # The provider may be updating the composer. Retry the read only.
    }
    Start-Sleep -Milliseconds 200
  }
  exit ${AUTO_SEND_EXIT.timeout}
}
$clock = [Diagnostics.Stopwatch]::StartNew()
$sawWindow = $false
$sawComposer = $false
$mismatchSince = @{}
while ($clock.Elapsed.TotalSeconds -lt $seconds) {
  $matching = $false
  $currentMismatches = @{}
  $windows = @()
  try {
    $owners = @(Get-Process -Name 'Grok Bot' -ErrorAction SilentlyContinue |
      Where-Object { $_.ProcessName -ceq 'Grok Bot' } |
      Select-Object -ExpandProperty Id)
    if ($owners.Count) {
      $windows = $root.FindAll($children, [System.Windows.Automation.Condition]::TrueCondition)
    }
  } catch {
    # Retry enumeration if the provider is temporarily unavailable.
  }
  foreach ($window in $windows) {
    try {
      if ($window.Current.ProcessId -notin $owners) { continue }
      $sawWindow = $true
      foreach ($composer in $window.FindAll($descendants, $editCondition)) {
        if ($composer.Current.ClassName -notlike '*sand-prompt-field*') { continue }
        $sawComposer = $true
        $actual = ComposerText $composer
        if ([string]::Equals($actual, $expected, [StringComparison]::Ordinal)) {
          $matching = $true
          foreach ($button in $window.FindAll($descendants, $buttonCondition)) {
            $state = $button.Current
            if ($state.ClassName -notlike '*sand-prompt-send*' -or !$state.IsEnabled -or
                $state.Name -notmatch '^(enviar|send)( message| mensagem)?$') { continue }
            $invoke = $null
            if (!$button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invoke)) { continue }
            if (![string]::Equals((ComposerText $composer), $expected, [StringComparison]::Ordinal)) { break }
            try { $invoke.Invoke() }
            catch { exit ${AUTO_SEND_EXIT.timeout} }
            ConfirmSend $composer $button
          }
        } elseif ($actual) {
          $id = $composer.GetRuntimeId() -join ','
          $currentMismatches[$id] = if ($mismatchSince.ContainsKey($id)) {
            $mismatchSince[$id]
          } else { $clock.ElapsedMilliseconds }
        }
      }
    } catch {
      # Windows and controls can disappear while Grok Bot switches chats.
    }
  }
  if ($matching) {
    $mismatchSince = @{}
  } else {
    $mismatchSince = $currentMismatches
    foreach ($since in $mismatchSince.Values) {
      if ($clock.ElapsedMilliseconds - $since -ge 3000) { exit ${AUTO_SEND_EXIT.mismatch} }
    }
  }
  Start-Sleep -Milliseconds 200
}
# Keep the existing exit code name for a missing Grok Bot window.
if (!$sawWindow) { exit ${AUTO_SEND_EXIT.notForeground} }
if (!$sawComposer) { exit ${AUTO_SEND_EXIT.noComposer} }
exit ${AUTO_SEND_EXIT.timeout}
}`;

async function sendComposer(request, signal) {
  request.waitStartedAt = request.sentAt;
  if (!request.autoSend) return null;
  if (signal.aborted) return { ok: false, error: 'not-sent' };
  const seconds = readPromptConfirmDismissed(GROK_BOT_DIRECTORY) === true ? 8 : 25;
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const code = await new Promise((resolve) => {
    const child = execFile(powershell, ['-NoProfile', '-NonInteractive', '-Command', AUTO_SEND_COMMAND, String(seconds)],
      { windowsHide: true, shell: false, signal, timeout: (seconds + 5) * 1000 }, (error) => {
        resolve(error ? error.code : AUTO_SEND_EXIT.sent);
      });
    child.stdin.on('error', () => {}); // The process can exit before reading stdin.
    child.stdin.end(request.sent.text, 'utf8');
  });
  if (code === AUTO_SEND_EXIT.mismatch) return { ok: false, error: 'draft-conflict' };
  if (signal.aborted) return { ok: false, error: 'not-sent' };
  request.waitStartedAt = Date.now();
  if (code !== AUTO_SEND_EXIT.sent) return null;
  request.autoSent = true;
  request.delivered = true;
  if (request.mode === 'wait' && promptWindow.isVisible()) {
    promptWindow.showInactive();
    promptWindow.moveTop();
  }
  return null;
}

function snapshotClipboard() {
  const image = clipboard.readImage();
  return { text: clipboard.readText(), html: clipboard.readHTML(), rtf: clipboard.readRTF(),
    image: image.isEmpty() ? null : image, formats: clipboard.availableFormats() };
}

function restoreClipboard(snapshot) {
  const plan = restorePlan(snapshot);
  if (plan.action === 'write') clipboard.write(plan.data);
  else clipboard.clear();
}

async function waitForCopiedText() {
  const startedAt = Date.now();
  for (;;) {
    const text = clipboard.readText();
    const decision = selectionPollDecision({ text, formats: clipboard.availableFormats(),
      elapsedMs: Date.now() - startedAt });
    if (decision === 'text') return text;
    if (decision !== 'wait') return '';
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

// Copies the selection of the focused app and opens the prompt with it. The clipboard is cleared first so
// an unchanged clipboard can't be mistaken for a new copy, and it is always restored afterwards. The copied
// text and the clipboard contents are never logged or saved.
async function sendSelection() {
  if (!promptWindow || capturingSelection) return;
  // With the prompt focused, Ctrl+C would copy from the prompt itself.
  if (promptWindow.isVisible() && promptWindow.isFocused()) return;
  capturingSelection = true;
  let copied = '';
  let snapshot;
  try {
    snapshot = snapshotClipboard();
    clipboard.clear();
    await pressCopy();
    copied = await waitForCopiedText();
  } catch {
    copied = '';
  } finally {
    try { if (snapshot) restoreClipboard(snapshot); } catch { /* Nothing else can be done here. */ }
    capturingSelection = false;
  }
  // A slow app may still answer the Ctrl+C after we gave up and restored; put the clipboard back again.
  if (!copied && snapshot) {
    setTimeout(() => {
      try { if (clipboard.readText() !== snapshot.text) restoreClipboard(snapshot); } catch { /* Ignore. */ }
    }, 400);
  }
  const { text, clipped } = clipSelection(copied, textLimit(settings.assistant));
  showPrompt({ prefill: { text, clipped, empty: !text } });
}

function warnShortcutUnavailable(accelerator) {
  const key = canonicalShortcut(accelerator) ?? accelerator;
  if (warnedShortcutAccelerators.has(key)) return;
  warnedShortcutAccelerators.add(key);
  tray.displayBalloon({
    title: t('app.name'),
    content: t('balloon.shortcutUnavailable', { shortcut: accelerator }),
  });
}

function applySelectionShortcut(accelerator) {
  if (registeredSelectionShortcut) {
    globalShortcut.unregister(registeredSelectionShortcut);
    registeredSelectionShortcut = undefined;
  }
  if (!accelerator) return true;
  try {
    if (globalShortcut.register(accelerator, () => { sendSelection(); })) {
      registeredSelectionShortcut = accelerator;
      return true;
    }
  } catch {
    // Also warn when Electron rejects the accelerator.
  }
  warnShortcutUnavailable(accelerator);
  return false;
}

function buildTrayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    ...(readyUpdateVersion ? [
      { label: t('tray.restartToUpdate', { version: readyUpdateVersion }), click: restartToUpdate,
        enabled: updateStatus.state !== 'checking' },
      { type: 'separator' },
    ] : []),
    { label: t('tray.openPrompt'), click: () => {
      if (promptWindow && !promptWindow.isVisible()) togglePrompt();
    } },
    { label: t('tray.settings'), click: () => openSettings() },
    { label: t('tray.resetPosition'), click: resetPromptBounds },
    { type: 'separator' },
    { label: t('tray.quit'), click: () => app.quit() },
  ]));
}

function getUpdateStatus() {
  return {
    ...updateStatus,
    currentVersion: app.getVersion(),
    installed: app.isPackaged,
    enabled: settings.autoUpdate,
    restarting: quittingForUpdate,
  };
}

function sendUpdateStatus() {
  if (settingsWindow && !settingsWindow.isDestroyed() && !settingsWindow.webContents.isDestroyed()) {
    settingsWindow.webContents.send('settings:update-status', getUpdateStatus());
  }
}

function setUpdateStatus(status) {
  const wasChecking = updateStatus.state === 'checking';
  updateStatus = status;
  if (readyUpdateVersion && wasChecking !== (status.state === 'checking')) buildTrayMenu();
  sendUpdateStatus();
}

function setReadyUpdate(version) {
  if (version === readyUpdateVersion) return;
  readyUpdateVersion = version;
  buildTrayMenu();
}

function restoreUpdateStatus(state) {
  setUpdateStatus(readyUpdateVersion ? { state: 'downloaded', version: readyUpdateVersion } : { state });
}

function startUpdater() {
  if (updater) return updater;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.logger = null;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  const feed = process.env.GROK_BOT_HELPER_UPDATE_FEED;
  if (isLoopbackFeed(feed)) autoUpdater.setFeedURL({ provider: 'generic', url: feed });

  autoUpdater.on('update-available', ({ version }) => {
    if (!settings.autoUpdate) {
      restoreUpdateStatus('idle');
      return;
    }
    setReadyUpdate(undefined);
    setUpdateStatus({ state: 'available', version });
  });
  autoUpdater.on('update-not-available', () => restoreUpdateStatus('up-to-date'));
  autoUpdater.on('download-progress', ({ percent }) => {
    const progress = Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : 0;
    if (updateStatus.state === 'downloading' && updateStatus.percent === progress) return;
    setUpdateStatus({ state: 'downloading', version: updateStatus.version, percent: progress });
  });
  autoUpdater.on('update-downloaded', ({ version }) => {
    setReadyUpdate(version);
    setUpdateStatus({ state: 'downloaded', version });
    if (notifiedUpdateVersions.has(version)) return;
    notifiedUpdateVersions.add(version);
    tray.displayBalloon({ title: t('update.readyTitle'), content: t('update.readyBalloon', { version }) });
  });
  autoUpdater.on('error', () => {
    if (quittingForUpdate) updateInstallFailed();
  });
  updater = autoUpdater;
  return updater;
}

async function runUpdateCheck() {
  if (!app.isPackaged || !settings.autoUpdate || updateCheckRunning || quittingForUpdate) return;
  updateCheckRunning = true;
  setUpdateStatus({ state: 'checking' });
  let download;
  try {
    download = (await startUpdater().checkForUpdates())?.downloadPromise;
  } catch {
    setUpdateStatus({ state: 'error', code: 'check-failed' });
  } finally {
    settings.lastUpdateCheckMs = Date.now();
    try { settings = saveSettings(settingsLocation.path, settings); } catch { /* Keep it in memory. */ }
  }
  try {
    await download;
  } catch {
    setUpdateStatus({ state: 'error', code: 'download-failed' });
  } finally {
    updateCheckRunning = false;
  }
}

function restartToUpdate() {
  if (!updater || quittingForUpdate || !readyUpdateVersion || updateStatus.state === 'checking') return;
  quittingForUpdate = true;
  sendUpdateStatus();
  try {
    updater.quitAndInstall(true, true);
  } catch {
    updateInstallFailed();
  }
}

function updateInstallFailed() {
  quittingForUpdate = false;
  setReadyUpdate(undefined);
  setUpdateStatus({ state: 'error', code: 'install-failed' });
}

function stopUpdateChecks() {
  clearTimeout(updateTimer);
  clearInterval(updateInterval);
}

function scheduleUpdateChecks({ immediate = false } = {}) {
  stopUpdateChecks();
  if (updater) updater.autoDownload = settings.autoUpdate;
  if (!app.isPackaged || !settings.autoUpdate) {
    sendUpdateStatus();
    return;
  }
  const startChecks = () => {
    updateInterval = setInterval(runUpdateCheck, UPDATE_INTERVAL_MS);
    runUpdateCheck();
  };
  if (immediate) {
    sendUpdateStatus();
    startChecks();
  } else {
    updateTimer = setTimeout(startChecks, FIRST_UPDATE_DELAY_MS);
  }
}

function loadPrompt() {
  return promptWindow.loadFile(path.join(__dirname, 'prompt', 'prompt.html'), { query: { locale: getLocale() } });
}

// Main and renderers share one locale: main switches here, then the windows reload with it in the query.
function applyLanguage() {
  const previous = getLocale();
  const locale = setLocale(resolveLocale(settings.language, app.getLocale()));
  if (locale === previous) return false;
  buildTrayMenu();
  setTrayTooltip(trayTooltip.key, trayTooltip.params);
  // A visible prompt would sit empty after the reload, so fill it again.
  loadPrompt().then(() => { if (promptWindow.isVisible()) showPrompt(); }).catch(() => {});
  return true;
}

function applyShortcut(accelerator) {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut);
    registeredShortcut = undefined;
  }

  try {
    if (globalShortcut.register(accelerator, togglePrompt)) {
      registeredShortcut = accelerator;
      return true;
    }
  } catch {
    // Also warn when Electron rejects the accelerator.
  }

  warnShortcutUnavailable(accelerator);
  return false;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    app.setAppUserModelId('app.grokbothelper.desktop');
    Object.assign(settingsLocation, { path: path.join(app.getPath('userData'), 'settings.json') });
    Object.freeze(settingsLocation);
    const firstRun = isFirstRun(fs.existsSync(settingsLocation.path));
    settings = loadSettings(settingsLocation.path);
    setLocale(resolveLocale(settings.language, app.getLocale()));
    history = loadHistory(historyFile);
    nativeTheme.themeSource = settings.theme;
    nativeTheme.on('updated', updateSettingsBackground);
    tray = new Tray(createTrayIcon());
    setTrayTooltip('app.name');
    buildTrayMenu();
    tray.on('click', () => {
      if (promptWindow && !promptWindow.isVisible()) togglePrompt();
    });

    ipcMain.handle('settings:get', () => ({
      ...settings,
      defaultShortcut: DEFAULT_SETTINGS.shortcut,
    }));
    ipcMain.handle('settings:update-status', getUpdateStatus);
    ipcMain.handle('settings:check-for-updates', () => { void runUpdateCheck(); });
    ipcMain.handle('settings:restart-to-update', restartToUpdate);
    const botsWithAvatars = () => {
      const result = listBots(GROK_BOT_DIRECTORY);
      if (!result.ok) return result;
      return { ok: true, bots: result.bots.map((bot) => ({
        ...bot, avatar: { color: avatarColor(bot.color, bot.id), initial: avatarInitial(bot.name) },
      })) };
    };
    ipcMain.handle('settings:bots', () => {
      const result = botsWithAvatars();
      const defaultId = resolveAgentId(GROK_BOT_DIRECTORY, '');
      return { ...result, defaultBotName: result.bots?.find((bot) => bot.id === defaultId)?.name };
    });
    ipcMain.handle('settings:openbot-agents', openBotAgents);
    ipcMain.handle('settings:open-openbot', openOpenBot);
    ipcMain.handle('settings:hermes-info', () => ({ defaultPath: HERMES_DEFAULT_PATH,
      defaultFound: Boolean(HERMES_DEFAULT_PATH) && hermesPathError(HERMES_DEFAULT_PATH) === null }));
    // What the prompt's picker (Ctrl+K) lists: Grok Bot bots, OpenBot agents or just Hermes.
    ipcMain.handle('prompt:bots', async () => {
      if (settings.assistant === 'openbot') {
        const result = await openBotAgents();
        return { ...result, assistant: 'openbot', bots: result.agents, selectedId: settings.openbotAgentId };
      }
      if (settings.assistant === 'hermes') {
        const executable = settings.hermesPath || HERMES_DEFAULT_PATH;
        const found = Boolean(executable) && hermesPathError(executable) === null;
        return { ok: true, assistant: 'hermes', state: found ? 'ready' : 'missing',
          bots: [{ id: 'hermes', name: 'Hermes', avatar: { color: avatarColor('purple'), initial: 'H' } }] };
      }
      return { ...botsWithAvatars(), assistant: 'grokbot' };
    });
    ipcMain.handle('prompt:open-openbot', openOpenBot);
    ipcMain.handle('settings:recording', (_event, isRecording) => {
      if (isRecording === true) {
        if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
        registeredShortcut = undefined;
        applySelectionShortcut('');
      } else if (isRecording === false) {
        applyShortcut(settings.shortcut);
        applySelectionShortcut(settings.selectionShortcut);
      }
    });
    ipcMain.handle('settings:save', (_event, payload) => {
      let botId = '';
      let botName = '';
      let botError = false;
      if (payload?.mode === 'list' && isValidBotId(payload.botId)) {
        botId = payload.botId;
        botName = typeof payload.botName === 'string' ? payload.botName.trim().slice(0, 80) : '';
      } else if (payload?.mode === 'manual') {
        botId = parseBotId(payload.botInput);
        if (botId === null) botError = true;
      } else if (payload?.mode !== 'default') {
        botError = true;
      }
      if (botError) {
        // The Grok Bot destination is hidden while OpenBot or Hermes is selected, so a half-typed bot link
        // there doesn't block saving: the saved Grok Bot destination is kept.
        if (!isAssistant(payload?.assistant) || payload.assistant === 'grokbot') return { ok: false, error: 'invalid-bot' };
        botId = settings.botId;
        botName = settings.botName;
      }
      const { shortcut, selectionShortcut, launchAtLogin, afterSend, autoSend, notifyOnReply, theme, language, autoUpdate } = payload;
      if (typeof autoSend !== 'boolean' || typeof notifyOnReply !== 'boolean' || typeof autoUpdate !== 'boolean'
          || !['system', 'dark', 'light'].includes(theme)) {
        return { ok: false, error: 'invalid-option' };
      }
      if (afterSend !== 'wait' && afterSend !== 'hide') return { ok: false, error: 'invalid-after-send' };
      if (!LANGUAGES.includes(language)) return { ok: false, error: 'invalid-language' };
      const templates = validateTemplates(payload.templates);
      if (!templates.ok) return { ok: false, error: 'invalid-templates' };
      if (!isValidShortcut(shortcut)) return { ok: false, error: 'invalid-shortcut' };
      const selectionError = typeof selectionShortcut === 'string'
        ? selectionShortcutError(selectionShortcut, shortcut) : 'invalid';
      if (selectionError === 'conflict') return { ok: false, error: 'selection-shortcut-conflict' };
      if (selectionError) return { ok: false, error: 'invalid-selection-shortcut' };
      const { assistant, openbotAgentId, hermesPath, hermesModel, hermesProvider, hermesContinue, replyTimeoutMinutes } = payload;
      // Checked before anything changes, like the other options above.
      if (!isAssistant(assistant)) return { ok: false, error: 'invalid-assistant' };
      // The agent is saved only when OpenBot is the assistant; otherwise the saved one is kept.
      let openbot = { openbotAgentId: settings.openbotAgentId, openbotAgentName: settings.openbotAgentName };
      if (assistant === 'openbot') {
        if (openbotAgentId !== '' && !isValidAgentId(openbotAgentId)) return { ok: false, error: 'invalid-openbot-agent' };
        openbot = { openbotAgentId, openbotAgentName: openbotAgentId && typeof payload.openbotAgentName === 'string'
          ? [...payload.openbotAgentName.trim()].slice(0, 80).join('') : '' };
      }
      // Fields of an assistant that isn't selected are hidden, so a bad value there can't block saving:
      // it is checked strictly only for the selected assistant and otherwise the saved value is kept.
      const hermesError = typeof hermesPath !== 'string' ? 'invalid' : hermesPath === '' ? null : hermesPathError(hermesPath);
      if (hermesError && assistant === 'hermes') {
        return { ok: false, error: hermesError === 'missing' ? 'missing-hermes-path' : 'invalid-hermes-path' };
      }
      const hermesNamesValid = isValidHermesName(hermesModel) && isValidHermesName(hermesProvider);
      if (!hermesNamesValid && assistant === 'hermes') return { ok: false, error: 'invalid-hermes-name' };
      if (typeof hermesContinue !== 'boolean') return { ok: false, error: 'invalid-option' };
      const timeoutValid = isValidReplyTimeout(replyTimeoutMinutes);
      if (!timeoutValid && assistant !== 'grokbot') return { ok: false, error: 'invalid-timeout' };
      const hermes = {
        hermesPath: hermesError === 'invalid' ? settings.hermesPath : hermesPath,
        hermesModel: hermesNamesValid ? hermesModel : settings.hermesModel,
        hermesProvider: hermesNamesValid ? hermesProvider : settings.hermesProvider,
        hermesContinue,
        replyTimeoutMinutes: timeoutValid ? replyTimeoutMinutes : settings.replyTimeoutMinutes,
      };
      const previousSettings = settings;
      const selectionChanged = selectionShortcut !== settings.selectionShortcut;
      // Free the old selection shortcut first so the two shortcuts can swap keys in one save.
      if (selectionChanged) applySelectionShortcut('');
      if (shortcut !== settings.shortcut && !applyShortcut(shortcut)) {
        applyShortcut(settings.shortcut);
        if (selectionChanged) applySelectionShortcut(settings.selectionShortcut);
        return { ok: false, error: 'shortcut-taken' };
      }
      if (selectionChanged && !applySelectionShortcut(selectionShortcut)) {
        // Give the prompt shortcut its keys back first: the old selection shortcut may use them.
        if (shortcut !== settings.shortcut) applyShortcut(settings.shortcut);
        applySelectionShortcut(settings.selectionShortcut);
        return { ok: false, error: 'selection-shortcut-taken' };
      }
      try {
        app.setLoginItemSettings({
          openAtLogin: Boolean(launchAtLogin),
          ...(!app.isPackaged ? { path: process.execPath, args: [app.getAppPath()] } : {}),
        });
        settings = saveSettings(settingsLocation.path, {
          ...settings,
          botId, botName, shortcut, selectionShortcut, launchAtLogin: Boolean(launchAtLogin), afterSend,
          autoSend, notifyOnReply, theme, language, templates: templates.templates, autoUpdate,
          assistant, ...openbot, ...hermes,
        });
        if (autoUpdate !== previousSettings.autoUpdate) scheduleUpdateChecks({ immediate: true });
        nativeTheme.themeSource = settings.theme;
        updateSettingsBackground();
        const localeChanged = applyLanguage();
        if (botId !== previousSettings.botId || assistant !== previousSettings.assistant
            || settings.openbotAgentId !== previousSettings.openbotAgentId) {
          resetDestination();
        }
        return { ok: true, settings, localeChanged };
      } catch {
        if (shortcut !== previousSettings.shortcut) applyShortcut(previousSettings.shortcut);
        if (selectionChanged) applySelectionShortcut(previousSettings.selectionShortcut);
        return { ok: false, error: 'unexpected' };
      }
    });

    // Reloads the settings window in the new language after a change (keeps welcome mode out of it).
    ipcMain.handle('settings:reload', () => {
      if (!settingsWindow || settingsWindow.isDestroyed()) return;
      settingsWindow.setTitle(t('settings.windowTitle'));
      settingsWindow.loadFile(path.join(__dirname, 'settings', 'settings.html'), { query: { locale: getLocale() } })
        .catch(() => {});
    });
    ipcMain.handle('settings:clear-history', () => {
      try {
        saveHistory(historyFile, []);
        history = [];
        return { ok: true };
      } catch { return { ok: false, error: 'unexpected' }; }
    });
    ipcMain.handle('prompt:select-bot', (_event, payload) => {
      if (settings.assistant === 'hermes') return { ok: true, conversation: loadConversation(), bot: botDetails(), ...assistantState() };
      if (settings.assistant === 'openbot') {
        if (!isValidAgentId(payload?.botId)) return { ok: false, error: 'invalid-bot' };
        try {
          const changed = payload.botId !== settings.openbotAgentId;
          settings = saveSettings(settingsLocation.path, { ...settings, openbotAgentId: payload.botId,
            openbotAgentName: typeof payload.botName === 'string' ? [...payload.botName.trim()].slice(0, 80).join('') : '' });
          if (changed) resetDestination();
          return { ok: true, conversation: loadConversation(), bot: botDetails(), ...assistantState() };
        } catch { return { ok: false, error: 'unexpected' }; }
      }
      if (payload?.botId !== '' && !isValidBotId(payload?.botId)) return { ok: false, error: 'invalid-bot' };
      try {
        settings = saveSettings(settingsLocation.path, { ...settings, botId: payload.botId,
          botName: typeof payload.botName === 'string' ? payload.botName.trim().slice(0, 80) : '' });
        resetDestination();
        return { ok: true, conversation: loadConversation(), bot: botDetails() };
      } catch { return { ok: false, error: 'unexpected' }; }
    });
    ipcMain.handle('prompt:copy', (_event, text) => {
      if (typeof text !== 'string') return { ok: false };
      clipboard.writeText(text.slice(0, 20000));
      return { ok: true };
    });
    ipcMain.handle('prompt:open-bot', async () => {
      if (settings.assistant === 'hermes') return { ok: false, error: 'open-failed' };
      if (settings.assistant === 'openbot') {
        const result = await openOpenBot();
        if (result.ok) promptWindow.hide();
        return result.ok ? { ok: true } : { ok: false, error: 'open-failed' };
      }
      const result = readConversation(GROK_BOT_DIRECTORY, settings.botId);
      const url = result.ok && isValidBotId(result.agentId)
        ? `grokbot://app/v1/agent?id=${encodeURIComponent(result.agentId)}` : 'grokbot://app/v1/open';
      try {
        await shell.openExternal(url);
        promptWindow.hide();
        return { ok: true };
      } catch { return { ok: false, error: 'open-failed' }; }
    });

    promptWindow = new BrowserWindow({
      icon: appIconPath(),
      width: 680,
      height: 160,
      frame: false,
      thickFrame: true,
      resizable: true,
      movable: true,
      roundedCorners: true,
      minWidth: 460,
      minHeight: 160,
      maxWidth: 1400,
      maxHeight: 1200,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c20' : '#fafafc',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    promptWindow.webContents.on('will-navigate', (event) => event.preventDefault());
    promptWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    promptWindow.on('blur', () => {
      if (!pinned && !sendingPrompt && !singleSend && !partsJob && !waitingInPlace() && currentAssistantJob()?.phase !== 'sending') {
        promptWindow.hide();
      }
    });
    // Windows emits will-move/will-resize only for manual changes.
    for (const event of ['will-move', 'will-resize']) {
      promptWindow.on(event, () => {
        if (!settingPromptBounds) userChangingBounds = true;
      });
    }
    promptWindow.on('moved', rememberPromptBounds);
    promptWindow.on('resized', rememberPromptBounds);
    // The drag region receives a native double-click without a DOM event.
    if (process.platform === 'win32') {
      promptWindow.hookWindowMessage(0x00A3, (hitTest) => {
        if (hitTest.readUInt32LE(0) === 2) resetPromptBounds();
      });
    }
    ipcMain.handle('prompt:set-pinned', (_event, value) => {
      if (typeof value !== 'boolean') return;
      pinned = value;
      updateAlwaysOnTop();
    });
    ipcMain.handle('prompt:reset-bounds', resetPromptBounds);
    ipcMain.handle('prompt:resize', (_event, height) => {
      if (typeof height !== 'number' || !Number.isFinite(height)) return;
      autoHeight = Math.max(128, Math.min(600, Math.ceil(height)));
      if (settings.promptBounds?.height || userChangingBounds) return;
      const bounds = promptWindow.getBounds();
      if (bounds.height !== Math.max(160, autoHeight)) setPromptBounds({ ...bounds, height: autoHeight });
    });

    ipcMain.handle('prompt:open-link', (_event, url) => {
      if (typeof url !== 'string') return;
      try {
        const protocol = new URL(url).protocol;
        if (protocol === 'http:' || protocol === 'https:') return shell.openExternal(url).catch(() => {});
      } catch { /* Ignore invalid URLs. */ }
    });

    ipcMain.handle('prompt:stop-waiting', () => {
      stopWaiting();
      stopAssistantJob();
      const conversation = { ...loadConversation(), waiting: false };
      promptWindow.webContents.send('prompt:conversation', conversation);
      return conversation;
    });
    ipcMain.handle('prompt:submit', async (_event, payload) => {
      const text = typeof payload === 'string' ? payload : payload?.text;
      if (partsJob || (usesGrokBot() && singleSend)) return { ok: false, error: 'busy' };
      if (!usesGrokBot()) return submitToAssistant(payload);
      const result = buildPromptLink({ text, botId: settings.botId });
      if (result.error === 'too-long') {
        // Tell the prompt how many parts it would take so it can offer to split it.
        return { ...result, parts: [...text].length <= MAX_PARTS * MAX_TEXT_LENGTH * 2 ? splitMessage(text).length : Infinity,
          maxParts: MAX_PARTS };
      }
      if (!result.ok) return result;
      const usage = usageDetails();
      if (usage.blocked && payload?.force !== true) {
        return { ok: false, error: 'limit', resetText: usage.resetText, percentUsed: usage.percentUsed };
      }
      if (!result.url.startsWith('grokbot://app/v1/prompt?')) {
        return { ok: false, error: 'open-failed' };
      }

      const request = { sentAt: Date.now(), botId: settings.botId, mode: settings.afterSend, autoSend: settings.autoSend,
        ...conversationBaseline(settings.botId),
        sent: { role: 'user', text: text.trim(), timestampMs: Date.now() } };
      const controller = new AbortController();
      singleSend = controller;
      try {
        sendingPrompt = true;
        await shell.openExternal(result.url);
        const failure = await sendComposer(request, controller.signal);
        if (failure) {
          sendingPrompt = false;
          return failure;
        }
        history = addToHistory(history, text);
        try { saveHistory(historyFile, history); } catch { /* Sending already succeeded; keep history in memory. */ }
        clearTimeout(hideTimer);
        sendingPrompt = false;
        if (!usesGrokBot() || request.botId !== settings.botId) return { ok: true, afterSend: request.mode };
        startWaiting(request);
        if (request.mode === 'hide') {
          sendingPrompt = true;
          hideTimer = setTimeout(() => {
            sendingPrompt = false;
            promptWindow.hide();
          }, 280);
        }
        return { ok: true, afterSend: request.mode };
      } catch {
        sendingPrompt = false;
        return { ok: false, error: 'open-failed' };
      } finally {
        singleSend = undefined;
      }
    });
    // Sends a long message as numbered parts, one at a time (see runParts). The user confirms this in the
    // prompt first; nothing is split without that click. Checks that fail before anything is sent are
    // returned directly; once sending starts, the outcome also goes out as a 'prompt:parts-progress' event,
    // so a prompt that was hidden, reopened or reloaded meanwhile still learns how it ended.
    ipcMain.handle('prompt:submit-parts', async (_event, payload) => {
      if (partsJob || singleSend || sendingPrompt) return { ok: false, error: 'busy' };
      // Only Grok Bot links have a length limit; OpenBot and Hermes take the whole message at once.
      if (!usesGrokBot()) return { ok: false, error: 'unexpected' };
      const text = payload?.text;
      if (typeof text !== 'string' || (payload.force !== undefined && typeof payload.force !== 'boolean')) {
        return { ok: false, error: 'empty' };
      }
      if ([...text].length > MAX_PARTS * MAX_TEXT_LENGTH * 2) return { ok: false, error: 'too-many-parts', maxParts: MAX_PARTS };
      const parts = splitMessage(text);
      if (!parts.length) return { ok: false, error: 'empty' };
      if (parts.length > MAX_PARTS) return { ok: false, error: 'too-many-parts', maxParts: MAX_PARTS };
      const links = parts.map((part) => buildPromptLink({ text: part, botId: settings.botId }));
      const invalid = links.find((link) => !link.ok);
      if (invalid) return invalid;
      if (links.some((link) => !link.url.startsWith('grokbot://app/v1/prompt?'))) return { ok: false, error: 'open-failed' };
      const usage = usageDetails();
      if (usage.blocked && payload.force !== true) {
        return { ok: false, error: 'limit', resetText: usage.resetText, percentUsed: usage.percentUsed };
      }

      const job = { controller: new AbortController(), autoSend: settings.autoSend, cancelled: false, part: 0, total: parts.length };
      partsJob = job;
      // A reply wait from an earlier message would read the same transcript; this send takes over.
      stopWaiting();
      deliveryFailure = undefined;
      let result;
      try {
        result = await runParts({ text, parts, links, job });
      } catch {
        partsJob = undefined;
        result = { ok: false, error: 'unexpected' };
      }
      promptWindow.webContents.send('prompt:parts-progress', { done: true, result });
      return { ...result, finished: true };
    });
    ipcMain.handle('prompt:cancel-parts', () => {
      if (partsJob) {
        partsJob.cancelled = true;
        partsJob.controller.abort();
      }
      return { ok: true };
    });
    ipcMain.handle('prompt:hide', () => promptWindow.hide());
    ipcMain.handle('prompt:open-settings', () => {
      promptWindow.hide();
      openSettings();
    });

    await loadPrompt();
    scheduleUpdateChecks();
    if (firstRun) {
      const chosen = pickShortcut(settings.shortcut, (accelerator) => {
        try {
          return globalShortcut.register(accelerator, togglePrompt);
        } catch {
          return false;
        } finally {
          // Registrations are temporary; applyShortcut keeps only the chosen shortcut.
          globalShortcut.unregister(accelerator);
        }
      });
      if (chosen.changed) settings.shortcut = chosen.shortcut;
      applyShortcut(settings.shortcut);
      applySelectionShortcut(settings.selectionShortcut);
      if (app.isPackaged) {
        app.setLoginItemSettings({ openAtLogin: true });
        settings.launchAtLogin = true;
      }
      try {
        settings = saveSettings(settingsLocation.path, settings);
      } catch {
        // An antivirus can lock the file for a moment; still show the welcome screen, which saves again.
      }
      openSettings({ welcome: true });
      tray.displayBalloon({
        title: t('balloon.ready.title'),
        content: t('balloon.ready.body', { shortcut: settings.shortcut }),
      });
      return;
    }
    // Keep startup registration pointing to the installed executable.
    if (app.isPackaged && settings.launchAtLogin) app.setLoginItemSettings({ openAtLogin: true });
    applyShortcut(settings.shortcut);
    applySelectionShortcut(settings.selectionShortcut);
  });

  app.on('second-instance', () => {
    if (quittingForUpdate) return;
    if (promptWindow && !promptWindow.isVisible()) togglePrompt();
  });

  app.on('will-quit', () => {
    if (boundsSaveTimer) {
      clearTimeout(boundsSaveTimer);
      try { saveSettings(settingsLocation.path, settings); } catch { /* The app is shutting down. */ }
    }
    clearTimeout(hideTimer);
    stopUpdateChecks();
    stopWaiting();
    singleSend?.abort();
    partsJob?.controller.abort();
    stopAllAssistantJobs();
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    // Keep running in the tray with no open windows.
  });
}
