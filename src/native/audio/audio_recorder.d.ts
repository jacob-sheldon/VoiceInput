export declare class AudioRecorder extends NodeJS.EventEmitter {
  constructor();
  start(): boolean;
  stop(): void;
  getAudioData(): Buffer;
  getAudioLevel(): number;
  on(event: 'audio-level', listener: (level: number) => void): this;
}
