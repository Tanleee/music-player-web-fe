import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TARGET_AUDIO_SAMPLE_RATE,
  TARGET_AUDIO_BIT_DEPTH,
  TARGET_AUDIO_CHANNELS,
  TFT_WIDTH,
  TFT_HEIGHT,
  TFT_RGB565_BYTE_LENGTH,
  encodeWavPcm16Mono,
  parseWavHeader,
  downmixAndResampleTo44100Mono,
  encodeRgb565LittleEndian,
  decodeRgb565LittleEndianToRgba,
  sanitizeFatFilename,
  parseFilenameMetadata,
} from './encoders';

test('TFT constants are portrait 240x320 (153,600 bytes)', () => {
  assert.equal(TFT_WIDTH, 240);
  assert.equal(TFT_HEIGHT, 320);
  assert.equal(TFT_RGB565_BYTE_LENGTH, 240 * 320 * 2);
  assert.equal(TFT_RGB565_BYTE_LENGTH, 153600);
});

test('encodeWavPcm16Mono writes valid 44100Hz 16-bit mono RIFF WAVE header and payload', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1.0, -1.0]);
  const wav = encodeWavPcm16Mono(samples);

  assert.equal(wav.byteLength, 44 + samples.length * 2);

  const header = parseWavHeader(wav);
  assert.equal(header.riffTag, 'RIFF');
  assert.equal(header.waveTag, 'WAVE');
  assert.equal(header.audioFormat, 1);
  assert.equal(header.numChannels, TARGET_AUDIO_CHANNELS);
  assert.equal(header.sampleRate, TARGET_AUDIO_SAMPLE_RATE);
  assert.equal(header.bitsPerSample, TARGET_AUDIO_BIT_DEPTH);
  assert.equal(header.byteRate, 88200);
  assert.equal(header.blockAlign, 2);
  assert.equal(header.dataChunkSize, 10);
});

test('downmixAndResampleTo44100Mono downmixes stereo and resamples to 44100Hz', () => {
  const left = new Float32Array(48000).fill(0.8);
  const right = new Float32Array(48000).fill(0.2);

  const mono44100 = downmixAndResampleTo44100Mono([left, right], 48000);
  assert.equal(mono44100.length, 44100);
  assert.ok(Math.abs(mono44100[0] - 0.5) < 1e-5);
});

test('encodeRgb565LittleEndian produces exact 153,600 bytes little-endian RGB565 for 240x320', () => {
  const rgba = new Uint8ClampedArray(TFT_WIDTH * TFT_HEIGHT * 4);

  // Pixel 0: Pure Red (255, 0, 0) -> RGB565 = 0xF800 -> Little Endian [0x00, 0xF8]
  rgba[0] = 255;
  rgba[1] = 0;
  rgba[2] = 0;
  rgba[3] = 255;

  // Pixel 1: Pure Green (0, 255, 0) -> RGB565 = 0x07E0 -> Little Endian [0xE0, 0x07]
  rgba[4] = 0;
  rgba[5] = 255;
  rgba[6] = 0;
  rgba[7] = 255;

  // Pixel 2: Pure Blue (0, 0, 255) -> RGB565 = 0x001F -> Little Endian [0x1F, 0x00]
  rgba[8] = 0;
  rgba[9] = 0;
  rgba[10] = 255;
  rgba[11] = 255;

  const bin = encodeRgb565LittleEndian(rgba, TFT_WIDTH, TFT_HEIGHT, false);
  assert.equal(bin.byteLength, 153600);

  assert.equal(bin[0], 0x00);
  assert.equal(bin[1], 0xf8);
  assert.equal(bin[2], 0xe0);
  assert.equal(bin[3], 0x07);
  assert.equal(bin[4], 0x1f);
  assert.equal(bin[5], 0x00);

  const decoded = decodeRgb565LittleEndianToRgba(bin);
  assert.equal(decoded[0], 255);
  assert.equal(decoded[5], 255);
  assert.equal(decoded[10], 255);
});

test('sanitizeFatFilename strips Vietnamese diacritics, special chars, and enforces max 24 chars before extension', () => {
  const out1 = sanitizeFatFilename('Đêm Thành Phố - Sơn Tùng M-TP (Live).mp3', 'wav');
  assert.equal(out1, 'Dem_Thanh_Pho_-_Son_Tung.wav');
  const base1 = out1.split('.')[0];
  assert.ok(base1.length <= 24);
  assert.match(base1, /^[A-Za-z0-9_-]+$/);

  const out2 = sanitizeFatFilename('Khúc Nhạc Vui.flac', 'wav');
  assert.equal(out2, 'Khuc_Nhac_Vui.wav');

  const out3 = sanitizeFatFilename('Hình Nền Đẹp 240x320!.png', '');
  assert.equal(out3, 'Hinh_Nen_Dep_240x320');
});

test('parseFilenameMetadata splits artist and title from filename', () => {
  const meta1 = parseFilenameMetadata('Tycho - Awake.flac');
  assert.equal(meta1.artist, 'Tycho');
  assert.equal(meta1.title, 'Awake');
  assert.equal(meta1.ext, 'FLAC');
});
