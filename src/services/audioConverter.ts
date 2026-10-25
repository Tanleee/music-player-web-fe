import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import {
  TARGET_AUDIO_SAMPLE_RATE,
  downmixAndResampleTo44100Mono,
  encodeWavPcm16Mono,
} from '../utils/encoders';

export interface ConversionResult {
  wavBytes: Uint8Array;
  wavBlobUrl: string;
  durationSec: number;
  originalSampleRate: number;
  originalChannels: number;
  engine: 'ffmpeg.wasm' | 'web-audio-pcm16';
}

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadFailed = false;

/**
 * Attempts to initialize @ffmpeg/ffmpeg in the browser.
 * If WASM worker initialization is blocked by CORS/COOP or offline sandbox,
 * gracefully falls back to client-side Web Audio API + PCM16 WAV encoding.
 */
async function getFFmpegInstance(): Promise<FFmpeg | null> {
  if (ffmpegLoadFailed) return null;
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }

  try {
    const ffmpeg = new FFmpeg();
    const loadPromise = ffmpeg.load();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('ffmpeg.wasm load timeout')), 4500)
    );
    await Promise.race([loadPromise, timeoutPromise]);
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  } catch {
    ffmpegLoadFailed = true;
    return null;
  }
}

/**
 * Converts any browser-supported audio File/Blob to the FIXED target specification:
 * WAV, 44100 Hz, 16-bit signed PCM, Mono (1 channel).
 */
export async function convertAudioFileToFixedWav(
  file: File,
  onProgress?: (progressPercent: number) => void
): Promise<ConversionResult> {
  onProgress?.(10);

  // First decode audio metadata & samples via Web Audio API so we have accurate
  // source sample rate, channel count, and fallback samples.
  const arrayBuffer = await file.arrayBuffer();
  onProgress?.(25);

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

  onProgress?.(45);

  // Try ffmpeg.wasm first with fixed flags: -acodec pcm_s16le -ar 44100 -ac 1
  const ffmpeg = await getFFmpegInstance();
  if (ffmpeg) {
    try {
      const safeId = Math.random().toString(36).slice(2, 9);
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '.audio';
      const inputName = `in_${safeId}${ext}`;
      const outputName = `out_${safeId}.wav`;

      await ffmpeg.writeFile(inputName, await fetchFile(file));
      onProgress?.(65);

      await ffmpeg.exec([
        '-i',
        inputName,
        '-vn',
        '-acodec',
        'pcm_s16le',
        '-ar',
        String(TARGET_AUDIO_SAMPLE_RATE),
        '-ac',
        '1',
        outputName,
      ]);

      onProgress?.(88);
      const data = await ffmpeg.readFile(outputName);
      await ffmpeg.deleteFile(inputName).catch(() => {});
      await ffmpeg.deleteFile(outputName).catch(() => {});

      if (data instanceof Uint8Array && data.byteLength > 44) {
        const wavBytes = new Uint8Array(data);
        const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });
        const wavBlobUrl = URL.createObjectURL(wavBlob);
        onProgress?.(100);
        return {
          wavBytes,
          wavBlobUrl,
          durationSec,
          originalSampleRate,
          originalChannels,
          engine: 'ffmpeg.wasm',
        };
      }
    } catch {
      // Fall through to deterministic Web Audio PCM16 mono encoder
    }
  }

  onProgress?.(70);
  const channelArrays: Float32Array[] = [];
  for (let c = 0; c < decodedBuffer.numberOfChannels; c++) {
    channelArrays.push(decodedBuffer.getChannelData(c));
  }

  const mono44100 = downmixAndResampleTo44100Mono(channelArrays, originalSampleRate);
  onProgress?.(90);

  const wavBytes = encodeWavPcm16Mono(mono44100);
  const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });
  const wavBlobUrl = URL.createObjectURL(wavBlob);

  onProgress?.(100);
  return {
    wavBytes,
    wavBlobUrl,
    durationSec,
    originalSampleRate,
    originalChannels,
    engine: 'web-audio-pcm16',
  };
}

/**
 * Generates a real playable stereo 48000Hz WAV File alongside its converted
 * 44100Hz 16-bit Mono WAV counterpart so users can immediately audition
 * "Before (Original Stereo)" vs "After (Converted 44.1kHz Mono)" in the browser.
 */
export function createSynthesizedDemoAudio(options: {
  fileName: string;
  baseFreqHz: number;
  chordIntervals: number[];
  durationSec: number;
}): {
  originalFile: File;
  originalUrl: string;
  convertedWavBytes: Uint8Array;
  convertedWavUrl: string;
  originalSizeBytes: number;
} {
  const { fileName, baseFreqHz, chordIntervals, durationSec } = options;
  const sourceRate = 48000;
  const numSamples = Math.floor(sourceRate * durationSec);
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sourceRate;
    const envelope = Math.min(1, t / 0.08) * Math.min(1, (durationSec - t) / 0.25);
    // Arpeggio step every 0.45s
    const stepIndex = Math.floor(t / 0.45) % chordIntervals.length;
    const stepSemitone = chordIntervals[stepIndex];
    const leadFreq = baseFreqHz * Math.pow(2, stepSemitone / 12);
    const padFreq = (baseFreqHz * 0.5) * Math.pow(2, chordIntervals[0] / 12);

    // Stereo separation: lead panned slightly left, harmonic shimmer panned right
    const leadSig = Math.sin(2 * Math.PI * leadFreq * t) * 0.35;
    const padSig = Math.sin(2 * Math.PI * padFreq * t) * 0.25;
    const harmonicSig = Math.sin(2 * Math.PI * (leadFreq * 1.5) * t) * 0.2;

    left[i] = (leadSig + padSig * 0.8) * envelope;
    right[i] = (harmonicSig + padSig * 0.8 + leadSig * 0.3) * envelope;
  }

  // Encode stereo 48000Hz WAV for the "Before (Original)" preview
  const stereoWavBytes = encodeStereo48kWav(left, right, sourceRate);
  const originalBlob = new Blob([stereoWavBytes], { type: 'audio/wav' });
  const originalFile = new File([originalBlob], fileName, { type: 'audio/wav' });
  const originalUrl = URL.createObjectURL(originalBlob);

  // Encode fixed 44100Hz 16-bit PCM Mono WAV for the "After (Converted)" preview
  const mono44100 = downmixAndResampleTo44100Mono([left, right], sourceRate);
  const convertedWavBytes = encodeWavPcm16Mono(mono44100);
  const convertedBlob = new Blob([convertedWavBytes], { type: 'audio/wav' });
  const convertedWavUrl = URL.createObjectURL(convertedBlob);

  return {
    originalFile,
    originalUrl,
    convertedWavBytes,
    convertedWavUrl,
    originalSizeBytes: stereoWavBytes.byteLength,
  };
}

function encodeStereo48kWav(left: Float32Array, right: Float32Array, sampleRate: number): Uint8Array {
  const numChannels = 2;
  const bytesPerSample = 2;
  const dataByteLength = left.length * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < left.length; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, l < 0 ? Math.round(l * 32768) : Math.round(l * 32767), true);
    view.setInt16(offset + 2, r < 0 ? Math.round(r * 32768) : Math.round(r * 32767), true);
    offset += 4;
  }

  return new Uint8Array(buffer);
}
