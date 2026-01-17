export {};

declare global {
  interface Window {
    electronAPI: {
      getState: () => Promise<string>;
      showWindow: () => Promise<void>;
      hideWindow: () => Promise<void>;
      onStateChanged: (callback: (state: string) => void) => void;
      onTextResult: (callback: (text: string) => void) => void;
    };
  }
}
