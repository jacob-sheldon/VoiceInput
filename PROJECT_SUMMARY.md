# KeyboardLess - Project Summary

## Complete macOS Voice Input Application

This is a fully functional, production-ready macOS voice input application built with Electron, TypeScript, and native macOS modules.

## Project Structure

```
KeyboardLess/
├── src/
│   ├── main/                    # Electron Main Process
│   │   ├── main.ts              # Entry point, app lifecycle
│   │   ├── types.ts             # TypeScript type definitions
│   │   └── whisper/
│   │       └── engine.ts        # Whisper.cpp integration
│   │
│   ├── renderer/                # UI Process
│   │   ├── index.html           # Status window UI
│   │   ├── ui.ts                # UI logic
│   │   └── global.d.ts          # Global type declarations
│   │
│   ├── preload/                 # Preload Script
│   │   └── preload.ts           # IPC bridge to renderer
│   │
│   └── native/                  # Native Modules (C++/Objective-C++)
│       ├── hotkey/              # Command key monitoring
│       │   ├── hotkey_monitor.cc      # Node.js bindings
│       │   ├── hotkey_monitor_impl.h  # Implementation header
│       │   ├── hotkey_monitor.d.ts    # TypeScript definitions
│       │   ├── index.ts               # Module loader
│       │   └── mac/
│       │       └── hotkey_monitor_mac.mm  # macOS implementation
│       │
│       └── injection/           # Text injection
│           ├── text_injection.cc       # Node.js bindings
│           ├── text_injection_impl.h   # Implementation header
│           ├── text_injection.d.ts     # TypeScript definitions
│           ├── index.ts                # Module loader
│           └── mac/
│               └── text_injection_mac.mm  # macOS implementation
│
├── scripts/
│   ├── build-native.js         # Build native modules
│   ├── install-whisper.sh      # Install whisper.cpp
│   └── download-model.js       # Download Whisper models
│
├── assets/
│   ├── icon.png                # Menu bar icon
│   └── create-icon.js          # Icon generation script
│
├── dist/                       # Compiled JavaScript (generated)
│   ├── main/
│   ├── preload/
│   └── renderer/
│
├── build/                      # Native module build output
│   └── Release/
│       ├── hotkey_monitor.node
│       └── text_injection.node
│
├── package.json                # Project configuration
├── binding.gyp                 # Native module build config
├── tsconfig.*.json            # TypeScript configs
├── README.md                   # Full documentation
├── SETUP.md                    # Quick setup guide
└── .gitignore                  # Git ignore rules
```

## Key Components

### 1. Electron Main Process (TypeScript)
- **main.ts**: Application entry point
  - Creates menu bar app (no dock icon)
  - Manages status window
  - Coordinates native modules
  - IPC communication handler

### 2. Native Modules

#### Hotkey Monitor (Objective-C++)
- Monitors global Command key events
- Uses NSEvent global event taps
- Detects key down/up events
- Emits callbacks to main process

#### Text Injection (Objective-C++)
- Uses Accessibility API (AXUIElement)
- Direct text field manipulation
- Fallback to CGEvent keyboard simulation
- Injects text into focused input fields

### 3. Whisper Engine
- Spawns whisper.cpp as child process
- Records audio via ffmpeg
- Transcribes audio files
- Returns text result

### 4. UI (HTML/TypeScript)
- Menu bar icon with status
- Floating status window
- Visual feedback for states:
  - Idle
  - Listening
  - Transcribing
  - Typing

## How It Works

1. **User double-presses Command key**
   - HotkeyMonitor detects the double-press gesture
   - Main process starts audio recording

2. **User speaks**
   - Audio is recorded to temp file
   - Status window shows "Listening"

3. **User presses Command key once**
   - Recording stops
   - Whisper.cpp transcribes audio
   - Status window shows "Transcribing"

4. **Text is injected**
   - Transcription result obtained
   - TextInjector inserts text into focused field
   - Status window shows "Typing"

5. **Return to idle**
   - App ready for next input

## Installation & Usage

### Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Build native modules
npm run build:native

# 3. Build TypeScript
npm run build

# 4. Install whisper.cpp (optional, for voice recognition)
npm run install:whisper

# 5. Download Whisper model (optional)
npm run download:model small

# 6. Install FFmpeg (required for audio recording)
brew install ffmpeg

# 7. Run the application
npm start
```

### Full Setup

See [SETUP.md](SETUP.md) for detailed setup instructions.

## System Requirements

- macOS 13.0 or later
- Node.js 18 or later
- Xcode Command Line Tools
- FFmpeg (for audio recording)
- Accessibility permissions (for text injection)

## Permissions Required

The app requires macOS Accessibility permissions to:
1. Monitor global Command key events
2. Inject text into other applications

Grant permissions in:
**System Settings → Privacy & Security → Accessibility**

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Menu Bar Icon                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Electron Main Process                │  │
│  │  ┌──────────────┐  ┌──────────────┐              │  │
│  │  │ Hotkey       │  │ Whisper      │              │  │
│  │  │ Monitor      │  │ Engine       │              │  │
│  │  │ (Native)     │  │ (Child Proc) │              │  │
│  │  └──────────────┘  └──────────────┘              │  │
│  │         │                     │                    │  │
│  │         ↓                     ↓                    │  │
│  │  ┌────────────────────────────────┐              │  │
│  │  │      Text Injection            │              │  │
│  │  │         (Native)               │              │  │
│  │  └────────────────────────────────┘              │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │                                      │
         │ IPC                                  │ CGEvent
         ↓                                      ↓
┌────────────────┐                    ┌────────────────┐
│ Status Window  │                    │ Focused App    │
│ (Renderer)     │                    │ Input Field    │
└────────────────┘                    └────────────────┘
```

## Development Scripts

```bash
npm run build          # Build everything
npm run build:native   # Build native modules only
npm run build:main     # Build main process only
npm run build:renderer # Build renderer only
npm run build:preload  # Build preload only
npm start              # Run the application
npm run dev            # Build and run
npm run clean          # Clean all build artifacts
npm run install:whisper # Install whisper.cpp
npm run download:model <model>  # Download Whisper model
```

## Troubleshooting

### Native module build fails
```bash
xcode-select --install
npm run clean
npm install
```

### Cannot inject text
Grant Accessibility permissions in System Settings

### Audio recording fails
```bash
brew install ffmpeg
```

### Whisper model not found
```bash
npm run download:model small
```

## Technology Stack

- **UI Framework**: Electron 28
- **Language**: TypeScript 5.3
- **Native Modules**: NAN (Native Abstractions for Node.js)
- **Speech Recognition**: whisper.cpp
- **Audio Recording**: FFmpeg
- **Build Tools**: node-gyp, make

## License

MIT

## Credits

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) - OpenAI Whisper in C/C++
- [Electron](https://www.electronjs.org/) - Cross-platform desktop framework
- [NAN](https://github.com/nodejs/nan) - Native abstractions for Node.js
