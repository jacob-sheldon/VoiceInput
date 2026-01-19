import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { WhisperConfig, TranscriptionResult } from '../types';

// Add Buffer type support
type AudioBuffer = Buffer | Uint8Array;

export class WhisperEngine {
  private recordingProcess: ChildProcess | null = null;
  private audioFilePath: string | null = null;
  private isRecording: boolean = false;
  private readonly tempDir: string;
  private readonly config: WhisperConfig;

  constructor(config?: Partial<WhisperConfig>) {
    this.tempDir = path.join(os.tmpdir(), 'keyboardless-audio');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    this.config = {
      model: config?.model || 'small',
      language: config?.language || 'en',
      threads: config?.threads || 4
    };

    this.ensureWhisperBinary();
  }

  private ensureWhisperBinary(): void {
    // Check if whisper.cpp binary exists
    const whisperPath = this.getWhisperPath();
    if (!fs.existsSync(whisperPath)) {
      console.warn(`whisper.cpp binary not found at ${whisperPath}`);
      console.warn('Please build and install whisper.cpp. See README for instructions.');
    }
  }

  private getWhisperPath(): string {
    // Try development path first (check if it exists)
    const devPath = path.join(__dirname, '../../../native-deps/whisper.cpp/build/bin/whisper-cli');
    if (fs.existsSync(devPath)) {
      return devPath;
    }

    // Fall back to production path
    if (process.resourcesPath) {
      return path.join(process.resourcesPath, 'app.asar.unpacked/native-deps/whisper.cpp/build/bin/whisper-cli');
    }

    return devPath; // Will fail with a clear error message
  }

  private getModelPath(): string {
    // Try development path first (check if it exists)
    const devPath = path.join(__dirname, `../../../native-deps/whisper.cpp/models/ggml-${this.config.model}.en.bin`);
    if (fs.existsSync(devPath)) {
      return devPath;
    }

    // Fall back to production path
    if (process.resourcesPath) {
      return path.join(process.resourcesPath, `whisper/models/ggml-${this.config.model}.en.bin`);
    }

    return devPath; // Will fail with a clear error message
  }

  async startRecording(): Promise<void> {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    this.audioFilePath = path.join(this.tempDir, `recording_${Date.now()}.wav`);

    // Use ffmpeg or sox for recording
    // For macOS, we can use the built-in audio recording via afplay
    // But for better quality, we'll use ffmpeg if available
    const ffmpegPath = this.getFFmpegPath();

    if (fs.existsSync(ffmpegPath)) {
      this.recordingProcess = spawn(ffmpegPath, [
        '-f', 'avfoundation',
        '-i', ':0',  // Default input device on macOS
        '-sample_rate', '16000',
        '-ac', '1',
        '-y',
        this.audioFilePath
      ]);
    } else {
      // Fallback: use macOS built-in tools
      this.recordingProcess = spawn('sox', [
        '-d',  // Default device
        '-r', '16000',
        '-c', '1',
        this.audioFilePath
      ]);
    }

    this.isRecording = true;

    return new Promise((resolve, reject) => {
      if (!this.recordingProcess) {
        reject(new Error('Failed to start recording'));
        return;
      }

      // Wait a bit to ensure recording started
      setTimeout(() => resolve(), 100);
    });
  }

  async stopRecordingAndTranscribe(): Promise<string> {
    if (!this.isRecording || !this.recordingProcess) {
      throw new Error('Not recording');
    }

    // Stop the recording process
    this.recordingProcess.kill('SIGINT');

    return new Promise((resolve, reject) => {
      this.recordingProcess?.on('close', async () => {
        this.isRecording = false;

        if (this.audioFilePath && fs.existsSync(this.audioFilePath)) {
          try {
            const result = await this.transcribe(this.audioFilePath);
            resolve(result);
          } catch (error) {
            console.error('Transcription failed:', error);
            reject(error);
          } finally {
            this.cleanupAudioFile();
          }
        } else {
          reject(new Error('Audio file not created'));
        }
      });

      // Force close after 2 seconds
      setTimeout(() => {
        if (this.recordingProcess) {
          this.recordingProcess.kill('SIGKILL');
        }
      }, 2000);
    });
  }

  private async transcribe(audioPath: string): Promise<string> {
    const whisperPath = this.getWhisperPath();
    const modelPath = this.getModelPath();

    if (!fs.existsSync(whisperPath)) {
      throw new Error('whisper.cpp binary not found. Please build whisper.cpp first.');
    }

    if (!fs.existsSync(modelPath)) {
      throw new Error(`Whisper model not found at ${modelPath}. Please download the model first.`);
    }

    return new Promise((resolve, reject) => {
      const args = [
        '-m', modelPath,
        '-f', audioPath,
        '-l', this.config.language,
        '-t', '4',  // threads
        '-otxt',   // output txt
        '-of', path.join(this.tempDir, 'output')
      ];

      const process = spawn(whisperPath, args);

      let output = '';
      let errorOutput = '';

      process.stdout?.on('data', (data) => {
        output += data.toString();
      });

      process.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          // Read the output file
          const outputPath = path.join(this.tempDir, 'output.txt');
          if (fs.existsSync(outputPath)) {
            const text = fs.readFileSync(outputPath, 'utf-8').trim();
            resolve(text);
          } else {
            // Try to parse from stdout
            const match = output.match(/\[.*?\]\s*\((.*?)\)/);
            resolve(match ? match[1] : output);
          }
        } else {
          reject(new Error(`Whisper failed with code ${code}: ${errorOutput}`));
        }
      });
    });
  }

  async transcribeAudioData(audioData: AudioBuffer): Promise<string> {
    if (audioData.length === 0) {
      throw new Error('Audio data is empty');
    }

    // Save audio data to a temporary file
    const audioFilePath = path.join(this.tempDir, `recording_${Date.now()}.wav`);
    fs.writeFileSync(audioFilePath, Buffer.from(audioData));

    try {
      const result = await this.transcribe(audioFilePath);
      return result;
    } finally {
      // Clean up the temporary file
      try {
        fs.unlinkSync(audioFilePath);
      } catch (error) {
        console.error('Failed to delete temporary audio file:', error);
      }
    }
  }

  private getFFmpegPath(): string {
    // Check common ffmpeg locations
    const possiblePaths = [
      '/opt/homebrew/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/usr/bin/ffmpeg'
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return 'ffmpeg';  // Hope it's in PATH
  }

  private cleanupAudioFile(): void {
    if (this.audioFilePath && fs.existsSync(this.audioFilePath)) {
      try {
        fs.unlinkSync(this.audioFilePath);
      } catch (error) {
        console.error('Failed to delete audio file:', error);
      }
    }
    this.audioFilePath = null;
  }

  cleanup(): void {
    if (this.recordingProcess) {
      this.recordingProcess.kill();
    }
    this.cleanupAudioFile();

    // Clean up temp directory
    try {
      fs.rmSync(this.tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up temp directory:', error);
    }
  }
}
