import { app, BrowserWindow, ipcMain, globalShortcut, Menu, Tray, nativeImage, NativeImage, screen } from 'electron';
import type { WebContents } from 'electron';
import * as path from 'path';
import { EventEmitter } from 'events';
import { WhisperEngine } from './whisper/engine';
import { ModelManager } from './whisper/model-manager';
import { getModelSpec, resolveModelPath } from './whisper/models';
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

class VoixApp {
  private tray: Tray | null = null;
  private statusWindow: BrowserWindow | null = null;
  private permissionWindow: BrowserWindow | null = null;
  private modelsWindow: BrowserWindow | null = null;
  private modelPromptWindow: BrowserWindow | null = null;
  private hotkeyMonitor: any = null;
  private textInjector: any = null;
  private audioRecorder: any = null;
  private whisperEngine: WhisperEngine | null = null;
  private modelManager: ModelManager;
  private activeModelId: string | null = null;
  private selectedModelId: string | null = null;
  private modelPreferencePath: string | null = null;
  private currentState: AppState = 'idle';
  private hasAccessibilityPermission: boolean = false;

  // Double-press detection state
  private lastCommandPressTime: number = 0;
  private commandPressTimer: NodeJS.Timeout | null = null;
  private readonly DOUBLE_PRESS_WINDOW_MS = 400;

  constructor() {
    this.modelManager = new ModelManager();
    this.setupElectronApp();
    this.setupIPC();
  }

  private setupElectronApp(): void {
    app.setName('Voix');
    app.whenReady().then(() => {
      this.loadModelPreference();
      this.createTray();
      this.setDockIcon();
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
    const iconPath = path.join(__dirname, '../../assets/trayTemplate.png');
    const trayIcon = nativeImage.createFromPath(iconPath);
    if (!trayIcon.isEmpty()) {
      trayIcon.setTemplateImage(true);
    }
    this.tray = new Tray(trayIcon.isEmpty() ? this.createDefaultIcon() : trayIcon);

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Status: Idle', enabled: false },
      { label: 'Models...', click: () => this.showModelsWindow() },
      { type: 'separator' },
      { label: 'Enable Hotkey', click: () => this.enableHotkeyMonitor() },
      { label: 'Quit', click: () => app.quit() }
    ]);

    this.tray.setContextMenu(contextMenu);
    this.tray.setToolTip('Voix - Double-press ⌘ to speak, press ⌘ to stop');
  }

  private setDockIcon(): void {
    if (process.platform !== 'darwin') {
      return;
    }

    const iconPath = path.join(__dirname, '../../assets/icon_source.png');
    const dockIcon = nativeImage.createFromPath(iconPath);
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
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

  private createModelPromptWindow(x?: number, y?: number): void {
    if (this.modelPromptWindow) {
      this.modelPromptWindow.focus();
      return;
    }

    const windowOptions: any = {
      width: 420,
      height: 180,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      backgroundColor: '#1c1c1e',
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    };

    if (x !== undefined && y !== undefined) {
      windowOptions.x = x;
      windowOptions.y = y;
    }

    this.modelPromptWindow = new BrowserWindow(windowOptions);
    this.modelPromptWindow.loadFile(path.join(__dirname, '../renderer/models_prompt.html'));

    this.modelPromptWindow.on('closed', () => {
      this.modelPromptWindow = null;
    });
  }

  private createModelsWindow(): void {
    if (this.modelsWindow) {
      this.modelsWindow.focus();
      return;
    }

    this.modelsWindow = new BrowserWindow({
      width: 560,
      height: 680,
      show: false,
      frame: false,
      transparent: false,
      backgroundColor: '#0c1118',
      resizable: true,
      center: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    this.modelsWindow.loadFile(path.join(__dirname, '../renderer/models.html'));

    this.modelsWindow.on('closed', () => {
      this.modelsWindow = null;
    });
  }

  private showModelsWindow(): void {
    this.createModelsWindow();
    if (this.modelsWindow) {
      this.modelsWindow.show();
      this.modelsWindow.focus();
    }
  }

  private initializeNativeModules(): void {
    try {
      this.hotkeyMonitor = new HotkeyMonitor();
      this.textInjector = new TextInjector();
      this.audioRecorder = new AudioRecorder();
      this.refreshWhisperEngine();

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

    if (!this.ensureModelReady()) {
      return;
    }

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
                console.log('[DEBUG] Focused app:', appInfo);
                // Use clipboard-based injection for terminals, direct injection otherwise
                if (appInfo.isTerminal) {
                  console.log('[DEBUG] Using clipboard-based injection for terminal');
                  const result = await this.textInjector.injectTextViaClipboard(text);
                  console.log('[DEBUG] Clipboard injection result:', result);
                } else {
                  console.log('[DEBUG] Using direct injection');
                  const result = await this.textInjector.injectText(text);
                  console.log('[DEBUG] Direct injection result:', result);
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

    const selectedModelId = this.getSelectedModelId();
    const bestModelId = this.modelManager.getBestModelId();
    const effectiveModelId = selectedModelId ?? bestModelId;
    const spec = effectiveModelId ? getModelSpec(effectiveModelId) : null;
    const label = spec?.label ?? effectiveModelId;
    const modelLabel = effectiveModelId
      ? `Model: ${label}${selectedModelId ? '' : ' (auto)'}`
      : 'Model: None';
    const statusLabels = {
      idle: 'Status: Idle',
      listening: 'Status: Listening...',
      transcribing: 'Status: Transcribing...',
      typing: 'Status: Typing...'
    };

    const contextMenu = Menu.buildFromTemplate([
      { label: statusLabels[this.currentState], enabled: false },
      { label: modelLabel, click: () => this.showModelsWindow() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  private showStatusWindow(): void {
    const position = this.getBottomCenterPosition(200, 60);

    // Destroy existing window and recreate with correct position
    if (this.statusWindow) {
      this.statusWindow.destroy();
    }

    this.createStatusWindow(position.x, position.y);

    // Wait for window to be ready, then show
    if (this.statusWindow) {
      this.statusWindow.once('ready-to-show', () => {
        this.statusWindow?.showInactive();
      });
    }
  }

  private showModelPromptWindow(): void {
    const position = this.getBottomCenterPosition(420, 180);
    this.createModelPromptWindow(position.x, position.y);

    if (this.modelPromptWindow) {
      this.modelPromptWindow.once('ready-to-show', () => {
        this.modelPromptWindow?.show();
      });
      this.modelPromptWindow.show();
      this.modelPromptWindow.focus();
    }
  }

  private getBottomCenterPosition(width: number, height: number): { x: number; y: number } {
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

    const x = (workArea.width - width) / 2;
    const y = workArea.height - height - 20; // 20px padding from bottom

    return {
      x: Math.floor(x + workArea.x),
      y: Math.floor(y + workArea.y)
    };
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

    ipcMain.handle('models:list', () => {
      return this.modelManager.listModels();
    });

    ipcMain.handle('models:best', () => {
      return this.modelManager.getBestModelId();
    });

    ipcMain.handle('models:active', () => {
      return this.getSelectedModelId();
    });

    ipcMain.handle('models:set-active', (_event, modelId: string | null) => {
      this.setSelectedModelId(modelId);
      return this.getSelectedModelId();
    });

    ipcMain.handle('models:dirs', () => {
      return this.modelManager.getModelDirectories();
    });

    ipcMain.handle('models:download', async (event, modelId: string) => {
      const fallbackSender = event.sender;
      try {
        await this.modelManager.downloadModel(modelId, (progress) => {
          this.sendModelsEvent('models:download-progress', progress, fallbackSender);
        });
        this.sendModelsEvent('models:download-complete', { modelId }, fallbackSender);
        this.refreshWhisperEngine();
      } catch (error: any) {
        this.sendModelsEvent(
          'models:download-error',
          {
          modelId,
          message: error?.message || 'Download failed'
          },
          fallbackSender
        );
        throw error;
      }
    });

    ipcMain.handle('models:delete', (_event, modelId: string) => {
      this.modelManager.deleteModel(modelId);
      let refreshed = false;
      if (this.selectedModelId === modelId) {
        this.setSelectedModelId(null);
        refreshed = true;
      }
      if (!refreshed) {
        this.refreshWhisperEngine();
      }
    });

    ipcMain.handle('models:open-window', () => {
      this.showModelsWindow();
    });
  }

  private refreshWhisperEngine(): void {
    const selectedModelId = this.getSelectedModelId();
    const bestModelId = this.modelManager.getBestModelId();
    const effectiveModelId = selectedModelId ?? bestModelId;
    if (!effectiveModelId) {
      if (this.whisperEngine) {
        this.whisperEngine.cleanup();
      }
      this.whisperEngine = null;
      this.activeModelId = null;
      this.updateTrayMenu();
      return;
    }

    if (this.activeModelId !== effectiveModelId) {
      if (this.whisperEngine) {
        this.whisperEngine.cleanup();
      }
      this.whisperEngine = new WhisperEngine({ model: effectiveModelId, language: null });
      this.activeModelId = effectiveModelId;
    }

    this.updateTrayMenu();
  }

  private getSelectedModelId(): string | null {
    if (!this.selectedModelId) {
      return null;
    }
    if (!resolveModelPath(this.selectedModelId)) {
      this.selectedModelId = null;
      this.persistModelPreference();
      return null;
    }
    return this.selectedModelId;
  }

  private setSelectedModelId(modelId: string | null): void {
    if (modelId) {
      if (!resolveModelPath(modelId)) {
        throw new Error('Model is not installed');
      }
      this.selectedModelId = modelId;
    } else {
      this.selectedModelId = null;
    }
    this.persistModelPreference();
    this.refreshWhisperEngine();
  }

  private loadModelPreference(): void {
    try {
      this.modelPreferencePath = path.join(app.getPath('userData'), 'model-preference.json');
      if (!fs.existsSync(this.modelPreferencePath)) {
        return;
      }
      const raw = fs.readFileSync(this.modelPreferencePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.modelId === 'string') {
        this.selectedModelId = parsed.modelId;
      }
    } catch (error) {
      console.warn('[model] failed to load preference', error);
      this.selectedModelId = null;
    }
  }

  private persistModelPreference(): void {
    if (!this.modelPreferencePath) {
      return;
    }
    try {
      if (!this.selectedModelId) {
        if (fs.existsSync(this.modelPreferencePath)) {
          fs.unlinkSync(this.modelPreferencePath);
        }
        return;
      }
      fs.writeFileSync(this.modelPreferencePath, JSON.stringify({ modelId: this.selectedModelId }));
    } catch (error) {
      console.warn('[model] failed to persist preference', error);
    }
  }

  private ensureModelReady(): boolean {
    this.refreshWhisperEngine();
    if (!this.whisperEngine) {
      this.showModelPromptWindow();
      return false;
    }
    return true;
  }

  private sendModelsEvent(channel: string, payload: any, fallback?: WebContents): void {
    const targets = new Map<number, WebContents>();

    if (this.modelsWindow && !this.modelsWindow.isDestroyed()) {
      const wc = this.modelsWindow.webContents;
      if (!wc.isDestroyed()) {
        targets.set(wc.id, wc);
      }
    }

    if (fallback && !fallback.isDestroyed()) {
      targets.set(fallback.id, fallback);
    }

    for (const wc of targets.values()) {
      try {
        wc.send(channel, payload);
      } catch (error) {
        console.warn(`[model] failed to send ${channel}`, error);
      }
    }
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
new VoixApp();
