import { app, BrowserWindow, ipcMain, globalShortcut, Menu, Tray, nativeImage, NativeImage, screen } from 'electron';
import * as path from 'path';
import { EventEmitter } from 'events';
import { WhisperEngine } from './whisper/engine';
import { AppState } from './types';
import * as fs from 'fs';
const util = require('util');

// Import native modules (directly from .node files)
// In production, native modules are unpacked to app.asar.unpacked
// Detect development vs production by checking if build directory exists
const devModulePath = path.join(__dirname, '../../build/Release');
const isDevelopment = fs.existsSync(devModulePath);
const nativeModulePath = isDevelopment
  ? devModulePath
  : path.join(process.resourcesPath, 'app.asar.unpacked', 'build', 'Release');
const HotkeyMonitorModule = require(path.join(nativeModulePath, 'hotkey_monitor.node'));
const TextInjectorModule = require(path.join(nativeModulePath, 'text_injection.node'));
const AudioRecorderModule = require(path.join(nativeModulePath, 'audio_recorder.node'));

// Extract the classes from the modules
// Make HotkeyMonitor inherit from EventEmitter if it doesn't already
const NativeHotkeyMonitor = HotkeyMonitorModule.HotkeyMonitor;
if (!NativeHotkeyMonitor.prototype.on) {
  util.inherits(NativeHotkeyMonitor, EventEmitter);
  Object.setPrototypeOf(NativeHotkeyMonitor.prototype, EventEmitter.prototype);
}
const HotkeyMonitor = NativeHotkeyMonitor;
const TextInjector = TextInjectorModule.TextInjection;

// Wrap AudioRecorder with EventEmitter
const NativeAudioRecorder = AudioRecorderModule.AudioRecorder;
// Make NativeAudioRecorder inherit from EventEmitter if it doesn't already
if (!NativeAudioRecorder.prototype.on) {
  util.inherits(NativeAudioRecorder, EventEmitter);
  Object.setPrototypeOf(NativeAudioRecorder.prototype, EventEmitter.prototype);
}
class AudioRecorder extends EventEmitter {
  constructor() {
    super();
    const nativeRecorder = new NativeAudioRecorder();
    // Forward 'audio-level' events from native to this emitter
    nativeRecorder.on('audio-level', (level: number) => {
      this.emit('audio-level', level);
    });
    this.nativeRecorder = nativeRecorder;
  }
  start(): boolean {
    return this.nativeRecorder.start();
  }
  stop(): void {
    this.nativeRecorder.stop();
  }
  getAudioData(): Buffer {
    return this.nativeRecorder.getAudioData();
  }
  getAudioLevel(): number {
    return this.nativeRecorder.getAudioLevel();
  }
  private nativeRecorder: any;
}

class KeyboardLessApp {
  private tray: Tray | null = null;
  private statusWindow: BrowserWindow | null = null;
  private permissionWindow: BrowserWindow | null = null;
  private hotkeyMonitor: any = null;
  private textInjector: any = null;
  private audioRecorder: any = null;
  private whisperEngine: WhisperEngine | null = null;
  private currentState: AppState = 'idle';
  private hasAccessibilityPermission: boolean = false;

  // Double-press detection state
  private lastCommandPressTime: number = 0;
  private commandPressTimer: NodeJS.Timeout | null = null;
  private readonly DOUBLE_PRESS_WINDOW_MS = 400;

  constructor() {
    this.setupElectronApp();
    this.setupIPC();
  }

  private setupElectronApp(): void {
    app.whenReady().then(() => {
      this.createTray();
      this.createStatusWindow();
      this.initializeNativeModules();
      this.registerAppSwitchListener();
    });

    app.on('window-all-closed', () => {
      // Prevent quitting on window close (menu bar app)
    });

    app.on('before-quit', () => {
      this.cleanup();
    });

    app.dock.hide();
  }

  private createTray(): void {
    // Create a simple icon for the tray
    const iconPath = path.join(__dirname, '../../assets/icon.png');
    const trayIcon = nativeImage.createFromPath(iconPath);
    this.tray = new Tray(trayIcon.isEmpty() ? this.createDefaultIcon() : trayIcon);

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Status: Idle', click: () => this.showStatusWindow() },
      { type: 'separator' },
      { label: 'Enable Hotkey', click: () => this.enableHotkeyMonitor() },
      { label: 'Quit', click: () => app.quit() }
    ]);

    this.tray.setContextMenu(contextMenu);
    this.tray.setToolTip('KeyboardLess - Double-press ⌘ to speak, press ⌘ to stop');
  }

  private enableHotkeyMonitor(): void {
    if (this.hotkeyMonitor && !this.hotkeyMonitor.isRunning) {
      this.hotkeyMonitor.start();
    }
  }

  private createDefaultIcon(): NativeImage {
    // Create a simple 16x16 icon
    return nativeImage.createEmpty();
  }

  private createStatusWindow(x?: number, y?: number): void {
    const windowOptions: any = {
      width: 200,
      height: 60,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: false,  // Don't steal focus from other apps
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    };

    // Set position if provided
    if (x !== undefined && y !== undefined) {
      windowOptions.x = x;
      windowOptions.y = y;
    }

    this.statusWindow = new BrowserWindow(windowOptions);
    this.statusWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  private initializeNativeModules(): void {
    try {
      this.hotkeyMonitor = new HotkeyMonitor();
      this.textInjector = new TextInjector();
      this.audioRecorder = new AudioRecorder();
      this.whisperEngine = new WhisperEngine({ model: 'base' });

      this.setupHotkeyCallbacks();

      // Set up audio level monitoring
      this.audioRecorder.on('audio-level', (level: number) => {
        if (this.currentState === 'listening') {
          if (this.statusWindow) {
            this.statusWindow.webContents.send('audio-level', level);
          }
        }
      });

      // Check accessibility permission
      this.hasAccessibilityPermission = HotkeyMonitor.checkAccessibilityPermission();

      if (this.hasAccessibilityPermission) {
        // Start hotkey monitor now that we have permission
        this.hotkeyMonitor.start();
      } else {
        // Show permission window if permission is not granted
        this.showPermissionWindow();
      }
    } catch (error) {
      console.error('Failed to initialize native modules:', error);
    }
  }

  private setupHotkeyCallbacks(): void {
    if (!this.hotkeyMonitor) return;

    this.hotkeyMonitor.on('command-quick-press', () => {
      this.handleCommandQuickPress();
    });

    this.hotkeyMonitor.on('command-down', () => {
      this.handleCommandDown();
    });

    this.hotkeyMonitor.on('command-up', () => {
      this.handleCommandUp();
    });
  }

  private async handleCommandDown(): Promise<void> {
    if (this.currentState !== 'idle') return;

    this.setState('listening');
    this.showStatusWindow();

    if (this.statusWindow) {
      this.statusWindow.webContents.send('state-changed', 'listening');
    }

    // Start native audio recording
    if (this.audioRecorder) {
      this.audioRecorder.start();
    }
  }

  private handleCommandQuickPress(): void {
    const now = Date.now();
    const timeSinceLastPress = now - this.lastCommandPressTime;

    // Clear any existing timer
    if (this.commandPressTimer) {
      clearTimeout(this.commandPressTimer);
      this.commandPressTimer = null;
    }

    if (this.currentState === 'listening') {
      // Recording is active - single press stops recording
      this.handleCommandUp();
    } else if (this.currentState === 'idle') {
      // Check for double-press within 400ms
      if (timeSinceLastPress < this.DOUBLE_PRESS_WINDOW_MS && timeSinceLastPress > 0) {
        // Double-press detected - start recording
        this.lastCommandPressTime = 0; // Reset to prevent triple-press from triggering again
        this.handleCommandDown();
      } else {
        // First press - wait for second press or timeout
        this.lastCommandPressTime = now;
        this.commandPressTimer = setTimeout(() => {
          this.lastCommandPressTime = 0;
          this.commandPressTimer = null;
        }, this.DOUBLE_PRESS_WINDOW_MS);
      }
    }
  }

  private async handleCommandUp(): Promise<void> {
    if (this.currentState !== 'listening') {
      return;
    }

    this.setState('transcribing');

    if (this.statusWindow) {
      this.statusWindow.webContents.send('state-changed', 'transcribing');
    }

    try {
      // Stop recording and get audio data
      if (this.audioRecorder) {
        this.audioRecorder.stop();
        const audioData = this.audioRecorder.getAudioData();

        // Transcribe audio data
        if (this.whisperEngine && audioData.length > 0) {
          const text = await this.whisperEngine.transcribeAudioData(audioData);

          if (text && text.trim().length > 0) {
            this.setState('typing');

            if (this.statusWindow) {
              this.statusWindow.webContents.send('state-changed', 'typing');
            }

            // Inject text into focused field
            if (this.textInjector) {
              try {
                const appInfo = await this.textInjector.getFocusedAppInfo();
                // Use clipboard-based injection for terminals, direct injection otherwise
                if (appInfo.isTerminal) {
                  await this.textInjector.injectTextViaClipboard(text);
                } else {
                  await this.textInjector.injectText(text);
                }
              } catch (error) {
                console.error('[ERROR] Text injection failed:', error);
                // Continue anyway - show preview even if injection failed
              }
            }

            // Show preview briefly
            if (this.statusWindow) {
              this.statusWindow.webContents.send('text-result', text);
            }
          }
        }
      }
    } catch (error) {
      // Log the error but don't let it prevent state reset
      console.error('Error during command up handling:', error);
    } finally {
      // Always return to idle after a short delay, regardless of success/failure
      setTimeout(() => {
        this.setState('idle');
        if (this.statusWindow) {
          this.statusWindow.webContents.send('state-changed', 'idle');
          this.hideStatusWindow();
        }
      }, 1000);
    }
  }

  private setState(state: AppState): void {
    this.currentState = state;
    this.updateTrayMenu();
  }

  private updateTrayMenu(): void {
    if (!this.tray) return;

    const statusLabels = {
      idle: 'Status: Idle',
      listening: 'Status: Listening...',
      transcribing: 'Status: Transcribing...',
      typing: 'Status: Typing...'
    };

    const contextMenu = Menu.buildFromTemplate([
      { label: statusLabels[this.currentState], click: () => this.showStatusWindow() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  private showStatusWindow(): void {
    let workArea;

    // Try to get the display where the focused window is
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      const display = screen.getDisplayMatching(focusedWindow.getBounds());
      workArea = display.workArea;
    } else {
      // Fallback: use the display where the cursor is (user is likely working there)
      const cursorPoint = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursorPoint);
      workArea = display.workArea;
    }

    // Center horizontally: (screen width - window width) / 2
    const x = (workArea.width - 200) / 2;
    // Position near bottom: screen height - window height - padding
    const y = workArea.height - 60 - 20; // 20px padding from bottom

    const finalX = Math.floor(x + workArea.x);
    const finalY = Math.floor(y + workArea.y);

    // Destroy existing window and recreate with correct position
    if (this.statusWindow) {
      this.statusWindow.destroy();
    }

    this.createStatusWindow(finalX, finalY);

    // Wait for window to be ready, then show
    if (this.statusWindow) {
      this.statusWindow.once('ready-to-show', () => {
        this.statusWindow?.showInactive();
      });
    }
  }

  private hideStatusWindow(): void {
    if (this.statusWindow) {
      setTimeout(() => {
        this.statusWindow?.hide();
      }, 500);
    }
  }

  private createPermissionWindow(): void {
    if (this.permissionWindow) {
      this.permissionWindow.focus();
      return;
    }

    this.permissionWindow = new BrowserWindow({
      width: 400,
      height: 450,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      center: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    this.permissionWindow.loadFile(path.join(__dirname, '../renderer/permission.html'));

    // Clean up when window is closed
    this.permissionWindow.on('closed', () => {
      this.permissionWindow = null;
    });
  }

  private showPermissionWindow(): void {
    this.createPermissionWindow();
    if (this.permissionWindow) {
      this.permissionWindow.show();
    }
  }

  private closePermissionWindow(): void {
    if (this.permissionWindow) {
      this.permissionWindow.close();
      this.permissionWindow = null;
    }
  }

  private onPermissionGranted(): void {
    this.hasAccessibilityPermission = true;
    if (this.hotkeyMonitor && !this.hotkeyMonitor.isRunning) {
      this.hotkeyMonitor.start();
    }
    this.closePermissionWindow();
  }

  private registerAppSwitchListener(): void {
    // Monitor application switches to ensure we can inject into the correct app
    require('electron').app.on('browser-window-focus', () => {
      // Application focus changed
    });
  }

  private setupIPC(): void {
    ipcMain.handle('get-state', () => this.currentState);
    ipcMain.handle('show-window', () => this.showStatusWindow());
    ipcMain.handle('hide-window', () => this.hideStatusWindow());

    // Permission-related IPC handlers
    ipcMain.handle('check-accessibility-permission', () => {
      return HotkeyMonitor.checkAccessibilityPermission();
    });

    ipcMain.handle('request-accessibility-permission', () => {
      HotkeyMonitor.requestAccessibilityPermission();
    });

    ipcMain.handle('permission-granted', () => {
      this.onPermissionGranted();
    });

    ipcMain.handle('close-permission-window', () => {
      this.closePermissionWindow();
    });
  }

  private cleanup(): void {
    if (this.hotkeyMonitor) {
      this.hotkeyMonitor.stop();
    }
    if (this.whisperEngine) {
      this.whisperEngine.cleanup();
    }
  }
}

// Initialize the app
new KeyboardLessApp();
