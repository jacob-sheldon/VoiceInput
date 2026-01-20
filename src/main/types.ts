export type AppState = 'idle' | 'listening' | 'transcribing' | 'typing';

export interface RecordingConfig {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

export interface WhisperConfig {
  model: string;  // e.g., 'medium-q8_0', 'base', 'small', etc.
  language?: string | null;  // undefined, null, or 'auto' for auto-detection
  threads: number;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  duration: number;
}
