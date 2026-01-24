import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getState: () => ipcRenderer.invoke('get-state'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  onStateChanged: (callback: (state: string) => void) => {
    ipcRenderer.on('state-changed', (_event, state) => callback(state));
  },
  onTextResult: (callback: (text: string) => void) => {
    ipcRenderer.on('text-result', (_event, text) => callback(text));
  },
  onAudioLevel: (callback: (level: number) => void) => {
    ipcRenderer.on('audio-level', (_event, level) => callback(level));
  },
  // Permission-related methods
  checkAccessibilityPermission: () => ipcRenderer.invoke('check-accessibility-permission'),
  requestAccessibilityPermission: () => ipcRenderer.invoke('request-accessibility-permission'),
  permissionGranted: () => ipcRenderer.invoke('permission-granted'),
  closePermissionWindow: () => ipcRenderer.invoke('close-permission-window'),
  // Model management methods
  listModels: () => ipcRenderer.invoke('models:list'),
  getBestModelId: () => ipcRenderer.invoke('models:best'),
  getModelDirectories: () => ipcRenderer.invoke('models:dirs'),
  downloadModel: (modelId: string) => ipcRenderer.invoke('models:download', modelId),
  deleteModel: (modelId: string) => ipcRenderer.invoke('models:delete', modelId),
  openModelsWindow: () => ipcRenderer.invoke('models:open-window'),
  onModelDownloadProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('models:download-progress', (_event, progress) => callback(progress));
  },
  onModelDownloadComplete: (callback: (payload: any) => void) => {
    ipcRenderer.on('models:download-complete', (_event, payload) => callback(payload));
  },
  onModelDownloadError: (callback: (payload: any) => void) => {
    ipcRenderer.on('models:download-error', (_event, payload) => callback(payload));
  }
});
