# KeyboardLess

A macOS voice input application using Electron and whisper.cpp. Hold the Command key to speak, and your speech will be transcribed and inserted into the currently focused text field.

## Features

- **Global Command Key Monitoring**: Hold Command to start speaking, release to transcribe
- **Local Speech Recognition**: Uses whisper.cpp for offline, privacy-preserving transcription
- **Direct Text Injection**: Text is inserted directly into the focused input field (not using clipboard)
- **Menu Bar App**: Runs in the menu bar without taking up dock space

## System Requirements

- macOS 13.0 or later
- Node.js 18 or later
- Xcode Command Line Tools (for building native modules)

## Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Install whisper.cpp

```bash
bash scripts/install-whisper.sh
```

### 3. Download Whisper Model

Download at least one model (small is recommended for balance of speed and accuracy):

```bash
# Download small model (recommended)
node scripts/download-model.js small

# Or download tiny model (faster, less accurate)
node scripts/download-model.js tiny
```

### 4. Install Audio Recording Tools

You need either `ffmpeg` or `sox` for audio recording:

```bash
# Using Homebrew
brew install ffmpeg
```

### 5. Build Native Modules

```bash
npm run build:native
```

### 6. Build TypeScript

```bash
npm run build
```

## Running the Application

```bash
npm start
```

The app will appear in your menu bar. Click the menu bar icon to see the status.

## Usage

1. Click on any text input field in any application
2. Hold the **Command key** (⌘)
3. Speak your text
4. Release the Command key
5. The transcribed text will be automatically inserted into the text field

## Project Structure

```
KeyboardLess/
├── src/
│   ├── main/           # Electron main process (TypeScript)
│   │   ├── main.ts     # Entry point
│   │   ├── types.ts    # Type definitions
│   │   └── whisper/    # Whisper engine integration
│   ├── renderer/       # UI process (TypeScript/HTML)
│   │   ├── index.html  # Status window
│   │   └── ui.ts       # UI logic
│   ├── preload/        # Preload script
│   └── native/         # Native modules
│       ├── hotkey/     # Command key monitoring (Objective-C++)
│       └── injection/  # Text injection (Objective-C++)
├── scripts/            # Build and setup scripts
├── assets/             # Icons and resources
├── models/             # Whisper model files
└── native-deps/        # Native dependencies (whisper.cpp)
```

## Architecture

### Electron Main Process
- Manages application lifecycle
- Creates menu bar icon and status window
- Coordinates between native modules and UI

### Native Modules

#### Hotkey Monitor (`hotkey_monitor`)
- Uses macOS Event Taps to monitor Command key globally
- Detects key down and key up events
- Emits events to the main process

#### Text Injection (`text_injection`)
- Uses macOS Accessibility API (AXUIElement)
- Falls back to CGEvent keyboard simulation
- Injects text directly into focused input fields

### Whisper Engine
- Spawns whisper.cpp as a child process
- Records audio using ffmpeg/sox
- Transcribes audio files
- Returns text result

## Development

### Build Native Modules

```bash
npm run build:native
```

### Build TypeScript

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

## Troubleshooting

### Native Module Build Fails

Make sure you have Xcode Command Line Tools installed:

```bash
xcode-select --install
```

### Audio Recording Fails

Install ffmpeg:

```bash
brew install ffmpeg
```

### Whisper Model Not Found

Download a model:

```bash
node scripts/download-model.js small
```

### Accessibility Permissions

The app needs Accessibility permissions to inject text. Grant permissions in:
System Settings → Privacy & Security → Accessibility

## Configuration

You can modify the whisper configuration in `src/main/main.ts`:

```typescript
const whisperEngine = new WhisperEngine({
  model: 'small',  // 'tiny' | 'small' | 'medium' | 'large'
  language: 'en',  // Language code
  threads: 4       // Number of CPU threads
});
```

## License

MIT

## Acknowledgments

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) - OpenAI Whisper model in C/C++
- [Electron](https://www.electronjs.org/) - Cross-platform desktop framework
