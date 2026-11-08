import {
  downmixAndResampleTo44100Mono,
  encodeWavPcm16Mono,
} from '../utils/encoders';

export interface ConversionResult {
  wavBytes: Uint8Array;
  wavBlobUrl: string;
  durationSec: number;
  originalSampleRate: number;
  originalChannels: number;
}

/**
 * Converts any browser-supported audio File to the FIXED target specification:
 * WAV, 44100 Hz, 16-bit signed PCM, Mono (1 channel) using the Web Audio API.
 * Fully local and offline-capable with zero external CDN dependencies.
 */
export async function convertAudioFileToFixedWav(
  file: File,
  onProgress?: (progressPercent: number) => void
): Promise<ConversionResult> {
  onProgress?.(10);

  const arrayBuffer = await file.arrayBuffer();
  onProgress?.(30);

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();

  let decodedBuffer: AudioBuffer;
  try {
    decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await audioCtx.close().catch(() => {});
  }

  const originalSampleRate = decodedBuffer.sampleRate;
  const originalChannels = decodedBuffer.numberOfChannels;
  const durationSec = decodedBuffer.duration;

  onProgress?.(60);

  const channelArrays: Float32Array[] = [];
  for (let c = 0; c < decodedBuffer.numberOfChannels; c++) {
    channelArrays.push(decodedBuffer.getChannelData(c));
  }

  const mono44100 = downmixAndResampleTo44100Mono(channelArrays, originalSampleRate);
  onProgress?.(85);

  const wavBytes = encodeWavPcm16Mono(mono44100);
  const wavBlob = new Blob([wavBytes as unknown as BlobPart], { type: 'audio/wav' });
  const wavBlobUrl = URL.createObjectURL(wavBlob);

  onProgress?.(100);
  return {
    wavBytes,
    wavBlobUrl,
    durationSec,
    originalSampleRate,
    originalChannels,
  };
}
