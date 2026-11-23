const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('grokbot', {
  submit: (text) => ipcRenderer.invoke('prompt:submit', text),
  hide: () => ipcRenderer.invoke('prompt:hide'),
  onShow: (callback) => {
    ipcRenderer.on('prompt:show', (_event, data) => callback(data));
  },
});
