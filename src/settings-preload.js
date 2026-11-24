const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('grokbotSettings', {
  clearHistory: () => ipcRenderer.invoke('settings:clear-history'),
  get: () => ipcRenderer.invoke('settings:get'),
  bots: () => ipcRenderer.invoke('settings:bots'),
  save: (payload) => ipcRenderer.invoke('settings:save', payload),
  updateStatus: () => ipcRenderer.invoke('settings:update-status'),
  checkForUpdates: () => ipcRenderer.invoke('settings:check-for-updates'),
  restartToUpdate: () => ipcRenderer.invoke('settings:restart-to-update'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('settings:update-status', (_event, status) => callback(status));
  },
  setRecording: (isRecording) => ipcRenderer.invoke('settings:recording', isRecording),
  reload: () => ipcRenderer.invoke('settings:reload'),
  openbotAgents: () => ipcRenderer.invoke('settings:openbot-agents'),
  openOpenBot: () => ipcRenderer.invoke('settings:open-openbot'),
  hermesInfo: () => ipcRenderer.invoke('settings:hermes-info'),
});
