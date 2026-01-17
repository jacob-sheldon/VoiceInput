# Quick Setup Guide

## Step-by-Step Installation

### 1. Install Node.js Dependencies

```bash
npm install
```

### 2. Build Native Modules

```bash
npm run build:native
```

Note: If you get errors about Xcode, install command line tools:
```bash
xcode-select --install
```

### 3. Install whisper.cpp

```bash
npm run install:whisper
```

This will clone and build whisper.cpp in `native-deps/whisper/`.

### 4. Download Whisper Model

Download at least one model (recommended: small):

```bash
npm run download:model small
```

Available models: tiny, small, medium, large-v3

### 5. Install FFmpeg (for audio recording)

```bash
brew install ffmpeg
```

### 6. Build TypeScript

```bash
npm run build
```

### 7. Run the Application

```bash
npm start
```

## Troubleshooting

### "hotkey_monitor.node not found"
Run: `npm run build:native`

### "whisper.cpp binary not found"
Run: `npm run install:whisper`

### "Whisper model not found"
Run: `npm run download:model small`

### Audio recording fails
Install FFmpeg: `brew install ffmpeg`

### Cannot inject text
Grant Accessibility permissions in:
System Settings → Privacy & Security → Accessibility → Add Terminal/Electron

## Verification

To verify everything is working:

1. Run `npm start`
2. Look for the menu bar icon (K)
3. Open any text editor
4. Hold Command key and speak
5. Release and see text appear

## Project File Overview

```
KeyboardLess/
├── package.json           # Project config
├── binding.gyp            # Native module build config
├── tsconfig.*.json        # TypeScript configs
├── README.md              # Full documentation
├── SETUP.md               # This file
├── scripts/
│   ├── build-native.js    # Build native modules
│   ├── install-whisper.sh # Install whisper.cpp
│   └── download-model.js  # Download whisper models
├── src/
│   ├── main/
│   │   ├── main.ts        # Electron main entry
│   │   ├── types.ts       # TypeScript types
│   │   └── whisper/
│   │       └── engine.ts  # Whisper integration
│   ├── renderer/
│   │   ├── index.html     # Status window UI
│   │   └── ui.ts          # UI logic
│   ├── preload/
│   │   └── preload.ts     # Electron preload
│   └── native/
│       ├── hotkey/        # Command key monitor
│       │   ├── *.cc       # C++ bindings
│       │   └── mac/*.mm   # macOS implementation
│       └── injection/     # Text injector
│           ├── *.cc       # C++ bindings
│           └── mac/*.mm   # macOS implementation
├── assets/
│   └── icon.png           # Menu bar icon
├── models/                # Whisper models (downloaded)
└── native-deps/
    └── whisper/           # whisper.cpp source
```

## Development Tips

### Rebuild Native Modules
```bash
npm run build:native
```

### Rebuild TypeScript
```bash
npm run build
```

### Clean Everything
```bash
npm run clean
npm install
```

### Run in Development Mode
```bash
npm run dev
```
