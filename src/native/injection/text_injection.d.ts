export interface AppInfo {
  bundleId: string;
  isTerminal: boolean;
  appName: string;
}

export class TextInjector {
  constructor();
  injectText(text: string): Promise<boolean>;
  getFocusedAppInfo(): Promise<AppInfo>;
  injectTextViaClipboard(text: string): Promise<boolean>;
}
