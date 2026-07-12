declare module 'soundtouchjs' {
  export class SoundTouch {
    pitch: number;
    tempo: number;
    rate: number;
    readonly inputBuffer: FifoSampleBuffer;
    readonly outputBuffer: FifoSampleBuffer;
    clear(): void;
    process(): void;
  }

  export class FifoSampleBuffer {
    readonly frameCount: number;
    putSamples(samples: Float32Array, position: number, numFrames: number): void;
    receiveSamples(output: Float32Array, numFrames: number): void;
    clear(): void;
  }

  export class SimpleFilter {
    constructor(source: unknown, pipe: SoundTouch, callback?: () => void);
    extract(target: Float32Array, numFrames: number): number;
  }
}
