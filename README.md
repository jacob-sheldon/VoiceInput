# KeyboardLess

> A macOS voice input application - Hold Command to speak, release to type.

KeyboardLess is a menu bar application that transcribes your voice using OpenAI's Whisper model and injects the text directly into any active text field. No internet required, no clipboard interference.

![Status](https://img.shields.io/badge/macOS-13%2B-blue)
![Electron](https://img.shields.io/badge/Electron-26.6.10-purple)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Global Command Key Trigger** - Hold ⌘ to speak, release to transcribe
- **Local Speech Recognition** - Uses whisper.cpp for offline, privacy-preserving transcription
- **Direct Text Injection** - Bypasses clipboard using macOS Accessibility API
- **Menu Bar App** - Runs unobtrusively in your menu bar
- **Native Performance** - C++/Objective-C++ modules for low-latency hotkey monitoring

## How It Works

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│ Hold ⌘ Key     │────▶│ Audio Record │────▶│ Whisper STT │────▶│ Text Inject  │
└─────────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
                              │                                      │
                              ▼                                      ▼
                        "Listening..."                         Into Active Field
```

## System Requirements

- **macOS**: 13.0 or later (Ventura, Sonoma, Sequoia)
- **Architecture**: Apple Silicon (arm64) or Intel (x64)
- **Node.js**: 18.0 or later
- **Xcode Command Line Tools**: For building native modules

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Build Native Modules

```bash
npm run build:native
```

### 3. Install whisper.cpp

```bash
npm run install:whisper
```

### 4. Download Whisper Model

Download at least one model (base is recommended for speed/accuracy balance):

```bash
# Base model (recommended - ~140MB)
npm run download:model base

# Tiny model (faster, less accurate - ~70MB)
npm run download:model tiny

# Small model (slower, more accurate - ~460MB)
npm run download:model small
```

### 5. Build & Run

```bash
npm run build
npm start
```

The app will appear in your menu bar (⌘).

## Usage

1. Click on any text input field in any application (TextEdit, Notes, browser, etc.)
2. Hold the **Command key (⌘)**
3. A status indicator appears showing "Listening..." with a red dot
4. Speak your text clearly
5. Release the Command key
6. The transcribed text will be automatically inserted into the text field

## First Run - Accessibility Permission

On first launch, you'll see a permission request window. KeyboardLess requires Accessibility permission to:

- Monitor the Command key globally
- Inject text into focused fields

Click **"Open System Settings"** and enable KeyboardLess under **Privacy & Security → Accessibility**.

## Project Structure

```
KeyboardLess/
├── src/
│   ├── main/                    # Electron Main Process (TypeScript)
│   │   ├── main.ts              # App lifecycle, coordination
│   │   ├── types.ts             # AppState type definitions
│   │   └── whisper/
│   │       └── engine.ts        # Whisper STT integration
│   ├── preload/
│   │   └── preload.ts           # IPC bridge (secure)
│   ├── renderer/                # UI Process
│   │   ├── index.html           # Status window
│   │   ├── permission.html      # Permission request
│   │   ├── permission.js        # Permission handling
│   │   └── ui.ts                # UI logic
│   └── native/                  # Native Addons (C++/Obj-C++)
│       ├── hotkey/              # Command key monitor
│       │   └── mac/
│       │       └── hotkey_monitor_mac.mm
│       ├── audio/               # Native audio recorder
│       │   └── mac/
│       │       └── audio_recorder_mac.mm
│       └── injection/           # Text injection
│           └── mac/
│               └── text_injection_mac.mm
├── scripts/                     # Build & setup scripts
├── models/                      # Whisper models (gitignored)
├── native-deps/                 # whisper.cpp (gitignored)
└── build/Release/               # Compiled .node files
```

## Architecture

### Electron Main Process
- Manages application lifecycle
- Creates tray icon and status window
- Coordinates between native modules
- Handles state transitions

### Native Modules

#### Hotkey Monitor (`hotkey_monitor.node`)
Uses macOS Event Taps (`CGEventTapCreate`) to globally monitor Command key events without interfering with normal shortcuts.

**Location**: `src/native/hotkey/mac/hotkey_monitor_mac.mm:140`

#### Audio Recorder (`audio_recorder.node`)
Uses `AVAudioEngine` for native audio capture to in-memory buffers.

**Location**: `src/native/audio/mac/audio_recorder_mac.mm`

#### Text Injection (`text_injection.node`)
Uses `AXUIElement` API to directly inject text into the focused element, bypassing the clipboard.

**Location**: `src/native/injection/mac/text_injection_mac.mm`

### Whisper Engine
Spawns whisper.cpp as a child process, passes audio data, receives transcription results.

## Development

### Build Commands

```bash
# Build native modules only
npm run build:native

# Build TypeScript only
npm run build:main
npm run build:renderer
npm run build:preload

# Build everything
npm run build

# Run in development
npm run dev

# Package for distribution
npm run dist:mac
```

### Project Status

| Component | Status |
|-----------|--------|
| Command Key Monitoring | ✅ Working |
| Audio Recording | ✅ Working |
| Whisper Transcription | ✅ Working |
| Text Injection | ✅ Working |
| Status Window UI | ✅ Working |
| Permission Flow | ✅ Working |

### Recent Fixes

**v1.0.0** - Fixed hotkey monitor not starting when accessibility permission was already granted. The monitor now starts automatically on app launch when permission exists.

## Troubleshooting

### Native Module Build Fails

**Install Xcode Command Line Tools:**
```bash
xcode-select --install
```

### App Not Responding to Command Key

1. **Check Accessibility Permission:**
   - System Settings → Privacy & Security → Accessibility
   - Ensure KeyboardLess is enabled

2. **Check Console Logs:**
   - Look for "Hotkey monitoring started" message
   - Run from terminal to see logs: `npm start`

3. **Verify Native Module:**
   ```bash
   ls build/Release/hotkey_monitor.node
   ```

### Whisper Not Transcribing

1. **Verify whisper.cpp Installation:**
   ```bash
   ls native-deps/whisper.cpp/main
   ```

2. **Download Model:**
   ```bash
   npm run download:model base
   ls models/ggml-base.bin
   ```

### Text Not Inserting

- Make sure you click in a text field before speaking
- Some apps may have restrictions on external text injection
- Try in TextEdit or Notes first to confirm functionality

## Configuration

Edit `src/main/main.ts` to configure Whisper:

```typescript
this.whisperEngine = new WhisperEngine({
  model: 'base',     // 'tiny' | 'base' | 'small' | 'medium' | 'large'
  language: 'en',    // Language code (auto-detect if not specified)
  threads: 4         // Number of CPU threads for transcription
});
```

## Model Comparison

| Model | Size | Speed | Accuracy |
|-------|------|-------|----------|
| tiny | 70MB | ⚡⚡⚡ | Good |
| base | 140MB | ⚡⚡ | Very Good |
| small | 460MB | ⚡ | Excellent |
| medium | 1.4GB | ~ | Outstanding |
| large | 2.8GB | ~ | Best |

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) - OpenAI Whisper in C/C++
- [Electron](https://www.electronjs.org/) - Cross-platform desktop framework
- [NAN](https://github.com/nodejs/nan) - Native Abstractions for Node.js

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
