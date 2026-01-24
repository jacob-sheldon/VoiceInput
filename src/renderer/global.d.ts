export {};

declare global {
  interface Window {
    electronAPI: {
      getState: () => Promise<string>;
      showWindow: () => Promise<void>;
      hideWindow: () => Promise<void>;
      onStateChanged: (callback: (state: string) => void) => void;
      onTextResult: (callback: (text: string) => void) => void;
      onAudioLevel: (callback: (level: number) => void) => void;
      checkAccessibilityPermission: () => Promise<boolean>;
      requestAccessibilityPermission: () => Promise<void>;
      permissionGranted: () => Promise<void>;
      closePermissionWindow: () => Promise<void>;
      listModels: () => Promise<any[]>;
      getBestModelId: () => Promise<string | null>;
      getModelDirectories: () => Promise<{ primary: string; legacy: string | null }>;
      downloadModel: (modelId: string) => Promise<void>;
      deleteModel: (modelId: string) => Promise<void>;
      openModelsWindow: () => Promise<void>;
      onModelDownloadProgress: (callback: (progress: any) => void) => void;
      onModelDownloadComplete: (callback: (payload: any) => void) => void;
      onModelDownloadError: (callback: (payload: any) => void) => void;
    };
  }
}
