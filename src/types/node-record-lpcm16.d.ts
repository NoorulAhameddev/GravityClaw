declare module 'node-record-lpcm16' {
  import type { Readable } from 'node:stream';

  export interface RecorderOptions {
    sampleRate?: number;
    sampleRateHertz?: number;
    channels?: number;
    threshold?: number;
    silence?: string;
    recordProgram?: string;
    [key: string]: unknown;
  }

  export interface AudioRecorder {
    stream(): Readable;
    stop(): void;
  }

  function record(options?: RecorderOptions): AudioRecorder;
  export default record;
}
