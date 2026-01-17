export class AudioRecorder {
  constructor();
  start(): boolean;
  stop(): void;
  getAudioData(): Buffer;
}
