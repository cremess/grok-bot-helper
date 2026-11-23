(() => {
  const STRINGS = { en: {
    'app.tagline': "Your Grok Bot, one shortcut away.",
    'prompt.empty': "No replies yet ? say hi to {bot}.",
    'prompt.notFound': "Couldn't find Grok Bot on this PC.",
    'app.name': "Grok Bot Helper",
    'settings.windowTitle': "Grok Bot Helper — Settings",
    'prompt.pin': "Pin",
    'prompt.unpin': "Unpin",
    'prompt.pinHelp': "Pin (keep open when clicking outside)",
    'prompt.close': "Close",
    'prompt.closeHelp': "Close (Esc)",
    'prompt.settings': "Open settings",
    'prompt.settingsHelp': "Settings (Ctrl+,)",
    'prompt.response': "Bot reply",
    'prompt.copy': "Copy reply",
    'prompt.openConversation': "Open conversation in Grok Bot",
    'prompt.conversation': "Conversation",
    'prompt.latest': "Latest reply",
    'prompt.more': "Show more",
    'prompt.less': "Show less",
    'prompt.message': "Message to Grok Bot",
    'prompt.placeholder': "Ask or tell Grok anything…",
    'prompt.send': "Send",
    'prompt.sent': "Sent ✓",
    'prompt.stop': "Stop",
    'prompt.retry': "Try again",
    'prompt.sendAnyway': "Send anyway",
    'prompt.awaitingDelivery': "Waiting for Grok Bot to receive your message… Confirm in Grok Bot if prompted.",
    'prompt.deliveryFailed': "Delivery failed",
    'prompt.deliveryHelp': "The confirmation may have been canceled, or Grok Bot may be closed.",
    'prompt.timeout': "The reply is taking a while. Check Grok Bot.",
    'errors.pin': "Couldn't change the pin setting.",
    'errors.empty': "Enter a message.",
    'errors.tooLong': "Your message exceeds 1000 characters.",
    'errors.configuredBot': "The selected bot is invalid. Update it in Settings.",
    'errors.open': "Couldn't open Grok Bot.",
    'errors.selectBot': "Couldn't switch bots.",
    'errors.copy': "Couldn't copy the reply.",
    'errors.stop': "Couldn't stop waiting.",
    'errors.unexpected': "Something went wrong.",
    'settings.title': "Settings",
    'settings.welcome.title': "Welcome to Grok Bot Helper",
    'settings.destination': "Destination",
    'picker.destination': "Destination bot",
    'settings.destination.description': "Where your messages go.",
    'settings.destination.warning': "Couldn't find your Grok Bot bots. Open Grok Bot once and click Refresh list, or choose Other bot.",
    'settings.refresh': "Refresh list",
    'settings.manual.label': "Paste the bot link or ID",
    'settings.manual.placeholder': "Paste the bot link or ID",
    'settings.manual.help': "Use the bot's Grok Bot link or paste its ID.",
    'settings.shortcut': "Shortcut",
    'settings.shortcut.title': "Open the prompt",
    'settings.shortcut.help': "Works in any app.",
    'settings.shortcut.label': "Global shortcut",
    'settings.shortcut.change': "Change",
    'settings.shortcut.restore': "Restore default",
    'settings.behavior': "Behavior",
    'settings.rows.afterSend.title': "After sending",
    'settings.rows.afterSend.wait': "Wait for reply",
    'settings.rows.afterSend.hide': "Close and notify",
    'settings.rows.afterSend.hideHelp': "Closes the prompt; marks the tray when the reply arrives.",
    'settings.rows.afterSend.waitHelp': "Shows the reply in the prompt.",
    'settings.rows.notify.title': "Notify when a reply arrives",
    'settings.rows.notify.help': "Shows a Windows notification when the prompt is closed.",
    'settings.rows.startup.title': "Launch at startup",
    'settings.rows.startup.help': "Opens the app when you sign in to Windows.",
    'settings.appearance': "Appearance",
    'settings.theme.title': "Theme",
    'settings.theme.help': "App appearance.",
    'settings.theme.system': "System",
    'settings.theme.dark': "Dark",
    'settings.theme.light': "Light",
    'settings.data': "Data",
    'settings.history.title': "Sent messages",
    'settings.history.help': "Keeps up to 50 messages on this computer.",
    'settings.history.clear': "Clear",
    'settings.history.confirmLabel': "Confirm clearing sent messages",
    'settings.history.yes': "Yes",
    'settings.history.no': "No",
    'settings.save': "Save",
    'settings.saveStart': "Save and get started",
    'settings.saved': "Settings saved",
    'settings.history.cleared': "Sent messages cleared",
    'settings.errors.option': "Select valid notification and theme options.",
    'settings.errors.bot': "Invalid bot link or ID.",
    'settings.errors.shortcut': "Invalid shortcut.",
    'settings.errors.afterSend': "Select a valid after-send option.",
    'settings.errors.shortcutTaken': "That shortcut is already used by another app.",
    'settings.shortcut.press': "Press a key combination…",
    'settings.shortcut.recording': "Recording…",
    'settings.welcome.missing': "Couldn't find Grok Bot on this computer. Install and open Grok Bot, then click Refresh list.",
    'picker.to': "To ",
    'picker.search': "Search bots…",
    'picker.searchLabel': "Search bots",
    'picker.default': "Grok Bot default",
    'picker.manual': "Other bot (paste link or ID)…",
    'picker.heading': "Your bots",
    'picker.mostUsed': "most used",
    'picker.empty': "No bots found",
    'bot.default': "default bot",
    'tray.openPrompt': "Open prompt",
    'tray.settings': "Settings…",
    'tray.resetPosition': "Reset prompt position",
    'tray.quit': "Quit",
    'balloon.ready.title': "Grok Bot Helper is ready",
    'bot.fallback': "bot {id}",
    'picker.compactDefault': "Grok",
    'picker.selectedLabel': "Destination bot: {name}",
    'picker.shortcutTitle': "{name} (Ctrl+K)",
    'prompt.waiting': "{bot} is replying",
    'prompt.usage': "Usage: {percent}%",
    'prompt.usageBlocked': "You're out of Grok Bot usage. Resets {reset}.",
    'prompt.limit': "Grok Bot usage is unavailable right now (resets {reset}).",
    'prompt.deliveryMessage': "Your message didn't reach Grok Bot. {detail}",
    'prompt.deliveryLimit': "You're out of usage (resets {reset}).",
    'tray.deliveryFailed': "Grok Bot Helper — Your message didn't reach Grok Bot",
    'tray.newReply': "Grok Bot Helper — New reply from {name}",
    'balloon.shortcutUnavailable': "Couldn't register {shortcut}. Another app may be using it.",
    'balloon.ready.body': "Use {shortcut} to open the prompt. The icon stays here in the tray.",
    'settings.welcome.message': "Welcome! Pick which Grok Bot bot your messages go to. Then press {shortcut} anywhere.",
    'settings.history.confirm': "Clear?",
    'prompt.hints.send': "send",
    'prompt.hints.newLine': "new line",
    'prompt.hints.close': "close",
    'prompt.counter': "{length}/{max}",
    'prompt.responseTime': "· {time}",
    'time.justNow': "just now",
    'time.minutesAgo': "{count} min ago",
    'time.hoursAgo': "{count} h ago",
    'time.yesterday': "yesterday, {time}",
    'time.date': "{date}, {time}",
    'usage.soon': "soon",
    'usage.today': "today",
    'usage.tomorrow': "tomorrow",
    'usage.reset': "{day} at {time}"
} };
  const LOCALES = ['en'];
  const DEFAULT_LOCALE = 'en';

  function t(key, params = {}, locale = DEFAULT_LOCALE) {
    try {
      const table = Object.hasOwn(STRINGS, locale) ? STRINGS[locale] : STRINGS[DEFAULT_LOCALE];
      if (!Object.hasOwn(table, key)) return key;
      return table[key].replace(/\{([^{}]+)\}/g, (placeholder, name) =>
        params != null && Object.hasOwn(params, name) ? String(params[name]) : placeholder);
    } catch {
      return key;
    }
  }

  function applyI18n(root = document) {
    for (const [attribute, target] of [
      ['data-i18n', null], ['data-i18n-placeholder', 'placeholder'],
      ['data-i18n-title', 'title'], ['data-i18n-aria-label', 'aria-label'],
    ]) {
      for (const element of root.querySelectorAll('[' + attribute + ']')) {
        const value = t(element.getAttribute(attribute));
        if (target) element.setAttribute(target, value);
        else element.textContent = value;
      }
    }
  }

  const api = { STRINGS, LOCALES, DEFAULT_LOCALE, t, applyI18n };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(globalThis, api);
})();
