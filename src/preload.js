const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('grokbot', {
  bots: () => ipcRenderer.invoke('prompt:bots'),
  selectBot: (bot) => ipcRenderer.invoke('prompt:select-bot', bot),
  copy: (text) => ipcRenderer.invoke('prompt:copy', text),
  openBot: () => ipcRenderer.invoke('prompt:open-bot'),
  openLink: (url) => ipcRenderer.invoke('prompt:open-link', url),
  onConversation: (callback) => {
    ipcRenderer.on('prompt:conversation', (_event, data) => callback(data));
  },
  submit: (text, options) => ipcRenderer.invoke('prompt:submit', options ? { text, force: options.force === true } : text),
  submitParts: (text, options) => ipcRenderer.invoke('prompt:submit-parts', { text, force: options?.force === true }),
  cancelParts: () => ipcRenderer.invoke('prompt:cancel-parts'),
  onPartsProgress: (callback) => {
    ipcRenderer.on('prompt:parts-progress', (_event, data) => callback(data));
  },
  stopWaiting: () => ipcRenderer.invoke('prompt:stop-waiting'),
  hide: () => ipcRenderer.invoke('prompt:hide'),
  setPinned: (pinned) => ipcRenderer.invoke('prompt:set-pinned', pinned),
  resetBounds: () => ipcRenderer.invoke('prompt:reset-bounds'),
  onBoundsReset: (callback) => {
    ipcRenderer.on('prompt:bounds-reset', () => callback());
  },
  onUserSized: (callback) => {
    ipcRenderer.on('prompt:user-sized', (_event, value) => callback(value));
  },
  openSettings: () => ipcRenderer.invoke('prompt:open-settings'),
  resize: (height) => ipcRenderer.invoke('prompt:resize', height),
  onShow: (callback) => {
    ipcRenderer.on('prompt:show', (_event, data) => callback(data));
  },
});
