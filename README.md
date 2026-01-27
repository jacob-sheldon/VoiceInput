# Voix

> A macOS menu bar voice input app - double-press Command to speak, press Command to stop.

Voix transcribes your voice locally with whisper.cpp and injects text into the active app. No cloud services required.

![Status](https://img.shields.io/badge/macOS-13%2B-blue)
![Electron](https://img.shields.io/badge/Electron-26.6.10-purple)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Double-press Command Trigger** - Double-press Command to start recording, press Command to stop
- **Offline Speech Recognition** - whisper.cpp transcription with local models
- **Native Audio Capture** - AVFoundation recorder with live level meter
- **Direct Text Injection** - Accessibility API injection with clipboard fallback for terminals
- **Model Manager UI** - Download, delete, and choose models from the tray
- **Menu Bar App** - Lightweight status HUD and tray controls

## How It Works

```
Command Command    Record    Transcribe    Inject
(Double-press) -> Audio -> whisper.cpp -> Active Text Field
```

## System Requirements

- **macOS**: 13.0 or later (Ventura, Sonoma, Sequoia)
- **Architecture**: Apple Silicon (arm64) or Intel (x64)
- **Node.js**: 18.0 or later
- **Xcode Command Line Tools**: native module builds
- **CMake**: required to build whisper.cpp

## Quick Start

### 1) Install Dependencies

```bash
npm install
```

### 2) Build Native Modules + TypeScript

```bash
npm run build
```

### 3) Install whisper.cpp

```bash
npm run install:whisper
```

### 4) Download a Model

```bash
# Base model (balanced speed/accuracy)
npm run download:model base

# Other options: small, medium, large-v3
```

### 5) Run

```bash
npm start
```

For local development:

```bash
npm run dev
```

## Usage

1. Focus any text field (Notes, browser, editor, etc.)
2. Double-press the Command key to start recording
3. Speak clearly while the status HUD shows Recording
4. Press Command once to stop
5. Voix transcribes and injects the text into the focused app

Terminal apps receive a clipboard-based injection fallback.

## Models

- Open **Models...** from the tray menu to download or delete models.
- The app auto-selects the best installed model if you have not chosen one.
- Models are stored in `~/Library/Application Support/Voix/models` by default.
- Override the model directory with `VOIX_MODELS_DIR`.

You can also use the CLI helper:

```bash
npm run download:model base
```

## Permissions

- **Accessibility**: required to monitor the hotkey and inject text
- **Microphone**: required for recording

Grant permissions in **System Settings > Privacy & Security > Accessibility**. macOS will prompt for microphone access on first use.

## Project Structure

```
Voix/
  src/
    main/                  # Electron main process
      main.ts              # App lifecycle, tray, IPC
      whisper/             # whisper.cpp orchestration
    preload/               # IPC bridge
    renderer/              # Status + models UI
      index.html           # Status HUD
      models.html          # Model manager window
      models_prompt.html   # No-model prompt
    native/                # C++/Obj-C++ modules
      hotkey/              # Command key monitor
      audio/               # Native audio recorder
      injection/           # Text injection
  scripts/                 # Build/setup helpers
  dist/                    # Compiled JS output
  build/Release/           # Compiled .node modules
```

## Development

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

## Troubleshooting

### Hotkey Not Working
- Ensure Accessibility permission is enabled
- Use the tray menu: **Enable Hotkey**
- Restart the app after granting permissions

### whisper.cpp Binary Missing
- Run: `npm run install:whisper`
- Verify: `native-deps/whisper.cpp/build/bin/whisper-cli`

### Model Not Found
- Open **Models...** from the tray menu and download one
- Or run: `npm run download:model base`
- Check your model directory if `VOIX_MODELS_DIR` is set

### No Text Injected
- Ensure Accessibility permission is enabled
- Try a non-terminal app to confirm direct injection

## License

MIT License - see LICENSE for details.

## Acknowledgments

- [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
- [Electron](https://www.electronjs.org/)
- [NAN](https://github.com/nodejs/nan)
