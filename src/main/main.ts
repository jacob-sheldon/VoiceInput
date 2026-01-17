import { app, BrowserWindow, ipcMain, globalShortcut, Menu, Tray, nativeImage, NativeImage } from 'electron';
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
    this.tray.setToolTip('KeyboardLess - Hold Command to speak');
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

  private createStatusWindow(): void {
    this.statusWindow = new BrowserWindow({
      width: 300,
      height: 200,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

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

  private async handleCommandUp(): Promise<void> {
    if (this.currentState !== 'listening') return;

    this.setState('transcribing');

    if (this.statusWindow) {
      this.statusWindow.webContents.send('state-changed', 'transcribing');
    }

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
            await this.textInjector.injectText(text);
          }

          // Show preview briefly
          if (this.statusWindow) {
            this.statusWindow.webContents.send('text-result', text);
          }
        }
      }
    }

    // Return to idle after a short delay
    setTimeout(() => {
      this.setState('idle');
      if (this.statusWindow) {
        this.statusWindow.webContents.send('state-changed', 'idle');
        this.hideStatusWindow();
      }
    }, 1000);
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
    if (this.statusWindow) {
      const mousePos = require('electron').screen.getCursorScreenPoint();
      this.statusWindow.setPosition(mousePos.x - 150, mousePos.y - 100);
      this.statusWindow.show();
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
