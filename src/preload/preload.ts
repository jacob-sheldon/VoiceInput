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
  closePermissionWindow: () => ipcRenderer.invoke('close-permission-window')
});
