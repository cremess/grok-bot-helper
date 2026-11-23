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
  submit: (text) => ipcRenderer.invoke('prompt:submit', text),
  hide: () => ipcRenderer.invoke('prompt:hide'),
  openSettings: () => ipcRenderer.invoke('prompt:open-settings'),
  resize: (height) => ipcRenderer.invoke('prompt:resize', height),
  onShow: (callback) => {
    ipcRenderer.on('prompt:show', (_event, data) => callback(data));
  },
});
