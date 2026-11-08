/**
 * Fixed hardware target constants for the ESP32 music player.
 * Audio: WAV, 44100Hz, 16-bit PCM, mono.
 * Display: 240x320 Portrait TFT (ST7789 via LovyanGFX), raw RGB565 little-endian.
 */
export const TARGET_AUDIO_SAMPLE_RATE = 44100 as const;
export const TARGET_AUDIO_BIT_DEPTH = 16 as const;
export const TARGET_AUDIO_CHANNELS = 1 as const;
export const TARGET_AUDIO_BYTES_PER_SAMPLE = 2 as const;
export const TARGET_AUDIO_BYTE_RATE =
  TARGET_AUDIO_SAMPLE_RATE * TARGET_AUDIO_CHANNELS * TARGET_AUDIO_BYTES_PER_SAMPLE; // 88200 B/s

export const TFT_WIDTH = 240 as const;
export const TFT_HEIGHT = 320 as const;
export const TFT_RGB565_BYTE_LENGTH = TFT_WIDTH * TFT_HEIGHT * 2; // 153,600 bytes

export interface WavHeaderInfo {
  riffTag: string;
  waveTag: string;
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  dataChunkSize: number;
}

/**
 * Sanitizes a filename for FAT SD card storage on ESP32:
 * - Normalizes NFD and strips Vietnamese/Latin diacritics (including đ/Đ -> d/D)
 * - Replaces spaces and special characters with "_"
 * - Keeps only ASCII letters, digits, "_", and "-"
 * - Truncates base name to max 24 characters before the extension
 */
export function sanitizeFatFilename(inputName: string, extension?: string): string {
  const trimmed = inputName.trim();
  const lastDot = trimmed.lastIndexOf('.');
  const rawBase = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
  const rawExt =
    extension !== undefined
      ? extension.replace(/^\./, '')
      : lastDot > 0
      ? trimmed.slice(lastDot + 1)
      : '';

  const asciiBase = rawBase
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');

  const safeBase = (asciiBase || 'file').slice(0, 24).replace(/[_-]+$/g, '') || 'file';

  if (!rawExt) {
    return safeBase;
  }

  const safeExt = rawExt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toLowerCase();

  return safeExt ? `${safeBase}.${safeExt}` : safeBase;
}

/**
 * Downmixes an array of channel Float32Arrays to mono and resamples to 44100 Hz
 * using linear interpolation.
 */
export function downmixAndResampleTo44100Mono(
  channels: readonly Float32Array[],
  sourceSampleRate: number
): Float32Array {
  if (channels.length === 0 || channels[0].length === 0) {
    return new Float32Array(0);
  }

  const sourceLength = channels[0].length;
  const numChannels = channels.length;

  const monoSource = new Float32Array(sourceLength);
  if (numChannels === 1) {
    monoSource.set(channels[0]);
  } else {
    for (let i = 0; i < sourceLength; i++) {
      let sum = 0;
      for (let c = 0; c < numChannels; c++) {
        sum += channels[c][i] ?? 0;
      }
      monoSource[i] = sum / numChannels;
    }
  }

  if (sourceSampleRate === TARGET_AUDIO_SAMPLE_RATE) {
    return monoSource;
  }

  const ratio = sourceSampleRate / TARGET_AUDIO_SAMPLE_RATE;
  const targetLength = Math.max(1, Math.round(sourceLength / ratio));
  const resampled = new Float32Array(targetLength);

  for (let i = 0; i < targetLength; i++) {
    const srcPos = i * ratio;
    const index0 = Math.floor(srcPos);
    const index1 = Math.min(sourceLength - 1, index0 + 1);
    const frac = srcPos - index0;
    resampled[i] = monoSource[index0] * (1 - frac) + monoSource[index1] * frac;
  }

  return resampled;
}

/**
 * Encodes mono Float32 audio samples [-1.0, 1.0] into a standard RIFF WAVE buffer
 * fixed at 44100 Hz, 16-bit signed PCM, Mono (1 channel).
 */
export function encodeWavPcm16Mono(monoSamplesAt44100: Float32Array): Uint8Array {
  const dataByteLength = monoSamplesAt44100.length * TARGET_AUDIO_BYTES_PER_SAMPLE;
  const totalByteLength = 44 + dataByteLength;
  const buffer = new ArrayBuffer(totalByteLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(view, 8, 'WAVE');

  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, TARGET_AUDIO_CHANNELS, true);
  view.setUint32(24, TARGET_AUDIO_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_AUDIO_BYTE_RATE, true);
  view.setUint16(32, TARGET_AUDIO_CHANNELS * TARGET_AUDIO_BYTES_PER_SAMPLE, true);
  view.setUint16(34, TARGET_AUDIO_BIT_DEPTH, true);

  writeAscii(view, 36, 'data');
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < monoSamplesAt44100.length; i++) {
    const clamped = Math.max(-1, Math.min(1, monoSamplesAt44100[i]));
    const int16 = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

/**
 * Parses a RIFF WAVE header to verify format compliance.
 */
export function parseWavHeader(wavBytes: Uint8Array): WavHeaderInfo {
  if (wavBytes.byteLength < 44) {
    throw new Error(`WAV buffer too small (${wavBytes.byteLength} bytes)`);
  }
  const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
  const riffTag = readAscii(view, 0, 4);
  const waveTag = readAscii(view, 8, 4);
  const audioFormat = view.getUint16(20, true);
  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const byteRate = view.getUint32(28, true);
  const blockAlign = view.getUint16(32, true);
  const bitsPerSample = view.getUint16(34, true);

  let offset = 12;
  let dataChunkSize = 0;
  while (offset + 8 <= wavBytes.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 'data') {
      dataChunkSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  return {
    riffTag,
    waveTag,
    audioFormat,
    numChannels,
    sampleRate,
    byteRate,
    blockAlign,
    bitsPerSample,
    dataChunkSize,
  };
}

/**
 * Encodes an RGBA pixel buffer (240x320 portrait) into raw RGB565 little-endian format
 * for ST7789 / LovyanGFX (`153,600` bytes).
 */
export function encodeRgb565LittleEndian(
  rgba: Uint8ClampedArray,
  width: number = TFT_WIDTH,
  height: number = TFT_HEIGHT,
  dither: boolean = false
): Uint8Array {
  if (width !== TFT_WIDTH || height !== TFT_HEIGHT) {
    throw new Error(`Wallpaper resolution must be exactly ${TFT_WIDTH}x${TFT_HEIGHT}, got ${width}x${height}`);
  }
  const expectedRgbaLength = width * height * 4;
  if (rgba.length !== expectedRgbaLength) {
    throw new Error(`Expected RGBA length ${expectedRgbaLength}, got ${rgba.length}`);
  }

  const totalPixels = width * height;
  const output = new Uint8Array(totalPixels * 2);

  const rBuf = new Float32Array(totalPixels);
  const gBuf = new Float32Array(totalPixels);
  const bBuf = new Float32Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    rBuf[i] = rgba[idx];
    gBuf[i] = rgba[idx + 1];
    bBuf[i] = rgba[idx + 2];
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const oldR = clampByte(rBuf[i]);
      const oldG = clampByte(gBuf[i]);
      const oldB = clampByte(bBuf[i]);

      const r5 = (oldR >> 3) & 0x1f;
      const g6 = (oldG >> 2) & 0x3f;
      const b5 = (oldB >> 3) & 0x1f;

      if (dither) {
        const quantR = (r5 << 3) | (r5 >> 2);
        const quantG = (g6 << 2) | (g6 >> 4);
        const quantB = (b5 << 3) | (b5 >> 2);

        const errR = oldR - quantR;
        const errG = oldG - quantG;
        const errB = oldB - quantB;

        if (x + 1 < width) {
          rBuf[i + 1] += (errR * 7) / 16;
          gBuf[i + 1] += (errG * 7) / 16;
          bBuf[i + 1] += (errB * 7) / 16;
        }
        if (y + 1 < height) {
          if (x > 0) {
            rBuf[i + width - 1] += (errR * 3) / 16;
            gBuf[i + width - 1] += (errG * 3) / 16;
            bBuf[i + width - 1] += (errB * 3) / 16;
          }
          rBuf[i + width] += (errR * 5) / 16;
          gBuf[i + width] += (errG * 5) / 16;
          bBuf[i + width] += (errB * 5) / 16;
          if (x + 1 < width) {
            rBuf[i + width + 1] += (errR * 1) / 16;
            gBuf[i + width + 1] += (errG * 1) / 16;
            bBuf[i + width + 1] += (errB * 1) / 16;
          }
        }
      }

      const rgb565 = (r5 << 11) | (g6 << 5) | b5;
      const outIdx = i * 2;
      output[outIdx] = rgb565 & 0xff;
      output[outIdx + 1] = (rgb565 >> 8) & 0xff;
    }
  }

  return output;
}

/**
 * Decodes raw RGB565 little-endian bytes (240x320) back into an RGBA pixel buffer.
 */
export function decodeRgb565LittleEndianToRgba(
  rgb565Bytes: Uint8Array,
  width: number = TFT_WIDTH,
  height: number = TFT_HEIGHT
): Uint8ClampedArray {
  const totalPixels = width * height;
  if (rgb565Bytes.byteLength !== totalPixels * 2) {
    throw new Error(`Expected ${totalPixels * 2} RGB565 bytes, got ${rgb565Bytes.byteLength}`);
  }
  const rgba = new Uint8ClampedArray(totalPixels * 4);
  for (let i = 0; i < totalPixels; i++) {
    const low = rgb565Bytes[i * 2];
    const high = rgb565Bytes[i * 2 + 1];
    const rgb565 = (high << 8) | low;

    const r5 = (rgb565 >> 11) & 0x1f;
    const g6 = (rgb565 >> 5) & 0x3f;
    const b5 = rgb565 & 0x1f;

    const outIdx = i * 4;
    rgba[outIdx] = (r5 << 3) | (r5 >> 2);
    rgba[outIdx + 1] = (g6 << 2) | (g6 >> 4);
    rgba[outIdx + 2] = (b5 << 3) | (b5 >> 2);
    rgba[outIdx + 3] = 255;
  }
  return rgba;
}

export function parseFilenameMetadata(fileName: string): {
  title: string;
  artist: string;
  ext: string;
} {
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf('.');
  const baseName = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
  const ext = lastDot > 0 ? trimmed.slice(lastDot + 1).toUpperCase() : 'AUDIO';

  const separatorIndex = baseName.indexOf(' - ');
  if (separatorIndex > 0) {
    const artist = baseName.slice(0, separatorIndex).trim();
    const title = baseName.slice(separatorIndex + 3).trim();
    return {
      artist: artist || 'Unknown Artist',
      title: title || baseName,
      ext,
    };
  }

  return {
    artist: 'Unknown Artist',
    title: baseName.replace(/[_-]+/g, ' ').trim() || 'Untitled Track',
    ext,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, exp);
  return `${value.toFixed(exp === 0 ? 0 : exp >= 2 ? 2 : 1)} ${units[exp]}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const totalSec = Math.round(seconds);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function clampByte(val: number): number {
  return Math.max(0, Math.min(255, Math.round(val)));
}

function writeAscii(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function readAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(view.getUint8(offset + i));
  }
  return out;
}
