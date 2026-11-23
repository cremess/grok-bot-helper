const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('grokbotSettings', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (payload) => ipcRenderer.invoke('settings:save', payload),
  setRecording: (isRecording) => ipcRenderer.invoke('settings:recording', isRecording),
});
