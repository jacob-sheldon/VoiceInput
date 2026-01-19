import { app, BrowserWindow, ipcMain, globalShortcut, Menu, Tray, nativeImage, NativeImage, screen } from 'electron';
import * as path from 'path';
import { WhisperEngine } from './whisper/engine';
import { AppState } from './types';

// Import native modules (directly from .node files)
const nativeModulePath = path.join(__dirname, '../../build/Release');
const HotkeyMonitorModule = require(path.join(nativeModulePath, 'hotkey_monitor.node'));
const TextInjectorModule = require(path.join(nativeModulePath, 'text_injection.node'));
const AudioRecorderModule = require(path.join(nativeModulePath, 'audio_recorder.node'));

// Extract the classes from the modules
const HotkeyMonitor = HotkeyMonitorModule.HotkeyMonitor;
const TextInjector = TextInjectorModule.TextInjection;
const AudioRecorder = AudioRecorderModule.AudioRecorder;

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
      console.log('Hotkey monitor enabled manually');
    }
  }

  private createDefaultIcon(): NativeImage {
    // Create a simple 16x16 icon
    return nativeImage.createEmpty();
  }

  private createStatusWindow(x?: number, y?: number): void {
    const windowOptions: any = {
      width: 300,
      height: 200,
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
    this.statusWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
  }

  private initializeNativeModules(): void {
    try {
      this.hotkeyMonitor = new HotkeyMonitor();
      this.textInjector = new TextInjector();
      this.audioRecorder = new AudioRecorder();
      this.whisperEngine = new WhisperEngine({ model: 'base' });

      this.setupHotkeyCallbacks();

      // Check accessibility permission
      this.hasAccessibilityPermission = HotkeyMonitor.checkAccessibilityPermission();

      if (this.hasAccessibilityPermission) {
        // Start hotkey monitor now that we have permission
        this.hotkeyMonitor.start();
        console.log('Native modules initialized successfully (accessibility granted, hotkey started)');
      } else {
        // Show permission window if permission is not granted
        console.log('Native modules initialized (waiting for accessibility permission)');
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
      console.log('[DEBUG] command-up event received, current state:', this.currentState);
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

    console.log('[DEBUG] Quick press detected, state:', this.currentState, 'timeSinceLastPress:', timeSinceLastPress);

    // Clear any existing timer
    if (this.commandPressTimer) {
      clearTimeout(this.commandPressTimer);
      this.commandPressTimer = null;
    }

    if (this.currentState === 'listening') {
      // Recording is active - single press stops recording
      console.log('[DEBUG] Stopping recording due to single press');
      this.handleCommandUp();
    } else if (this.currentState === 'idle') {
      // Check for double-press within 400ms
      if (timeSinceLastPress < this.DOUBLE_PRESS_WINDOW_MS && timeSinceLastPress > 0) {
        // Double-press detected - start recording
        console.log('[DEBUG] Double-press detected, starting recording');
        this.lastCommandPressTime = 0; // Reset to prevent triple-press from triggering again
        this.handleCommandDown();
      } else {
        // First press - wait for second press or timeout
        console.log('[DEBUG] First press, starting timer');
        this.lastCommandPressTime = now;
        this.commandPressTimer = setTimeout(() => {
          console.log('[DEBUG] Double-press timeout, resetting');
          this.lastCommandPressTime = 0;
          this.commandPressTimer = null;
        }, this.DOUBLE_PRESS_WINDOW_MS);
      }
    }
  }

  private async handleCommandUp(): Promise<void> {
    console.log('[DEBUG] handleCommandUp called, current state:', this.currentState);

    if (this.currentState !== 'listening') {
      console.log('[DEBUG] Early return: state is not listening');
      return;
    }

    console.log('[DEBUG] Setting state to transcribing');
    this.setState('transcribing');

    if (this.statusWindow) {
      console.log('[DEBUG] Sending state-changed transcribing to renderer');
      this.statusWindow.webContents.send('state-changed', 'transcribing');
    } else {
      console.log('[DEBUG] No status window to send to');
    }

    try {
      // Stop recording and get audio data
      if (this.audioRecorder) {
        console.log('[DEBUG] Stopping audio recorder');
        this.audioRecorder.stop();
        const audioData = this.audioRecorder.getAudioData();
        console.log('[DEBUG] Audio data length:', audioData.length);

        // Transcribe audio data
        if (this.whisperEngine && audioData.length > 0) {
          console.log('[DEBUG] Starting transcription');
          const text = await this.whisperEngine.transcribeAudioData(audioData);
          console.log('[DEBUG] Transcription result:', text);

          if (text && text.trim().length > 0) {
            this.setState('typing');

            if (this.statusWindow) {
              this.statusWindow.webContents.send('state-changed', 'typing');
            }

            // Inject text into focused field
            if (this.textInjector) {
              try {
                console.log('[DEBUG] Getting focused app info...');
                const appInfo = await this.textInjector.getFocusedAppInfo();
                console.log('[DEBUG] Focused app:', appInfo);

                // Use clipboard-based injection for terminals, direct injection otherwise
                if (appInfo.isTerminal) {
                  console.log('[DEBUG] Using clipboard injection for terminal:', appInfo.appName);
                  await this.textInjector.injectTextViaClipboard(text);
                  console.log('[DEBUG] Clipboard injection completed');
                } else {
                  console.log('[DEBUG] Using direct injection for:', appInfo.appName);
                  await this.textInjector.injectText(text);
                  console.log('[DEBUG] Direct injection completed');
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
        } else {
          console.log('[DEBUG] Skipping transcription - whisperEngine:', !!this.whisperEngine, 'audioData.length:', audioData.length);
        }
      } else {
        console.log('[DEBUG] No audio recorder available');
      }
    } catch (error) {
      // Log the error but don't let it prevent state reset
      console.error('Error during command up handling:', error);
    } finally {
      console.log('[DEBUG] Finally block - scheduling state reset to idle');
      // Always return to idle after a short delay, regardless of success/failure
      setTimeout(() => {
        console.log('[DEBUG] Timeout callback - setting state to idle');
        this.setState('idle');
        if (this.statusWindow) {
          console.log('[DEBUG] Sending state-changed idle to renderer');
          this.statusWindow.webContents.send('state-changed', 'idle');
          this.hideStatusWindow();
        } else {
          console.log('[DEBUG] No status window to send to in timeout');
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
      console.log('[DEBUG] showStatusWindow - using focused window display');
    } else {
      // Fallback: use the display where the cursor is (user is likely working there)
      const cursorPoint = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursorPoint);
      workArea = display.workArea;
      console.log('[DEBUG] showStatusWindow - using cursor display (fallback)');
    }

    console.log('[DEBUG] showStatusWindow - workArea:', workArea);

    // Center horizontally: (screen width - window width) / 2
    const x = (workArea.width - 300) / 2;
    // Position near bottom: screen height - window height - padding
    const y = workArea.height - 200 - 20; // 20px padding from bottom

    const finalX = Math.floor(x + workArea.x);
    const finalY = Math.floor(y + workArea.y);
    console.log('[DEBUG] showStatusWindow - final position:', { x: finalX, y: finalY });

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

    this.permissionWindow.loadFile(path.join(__dirname, '../../src/renderer/permission.html'));

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
      console.log('Hotkey monitoring started after permission granted');
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
