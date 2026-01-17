export class HotkeyMonitor {
  constructor();
  start(): void;
  stop(): void;
  on(event: 'command-down' | 'command-up', callback: () => void): void;
}
