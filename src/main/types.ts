export type AppState = 'idle' | 'listening' | 'transcribing' | 'typing';

export interface RecordingConfig {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

export interface WhisperConfig {
  model: 'tiny' | 'base' | 'small' | 'medium' | 'large';
  language: string;
  threads: number;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  duration: number;
}
