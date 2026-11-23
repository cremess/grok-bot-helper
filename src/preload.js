const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('grokbot', {
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
