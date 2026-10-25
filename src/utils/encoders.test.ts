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
  reorderItems,
  parseFilenameMetadata,
} from './encoders';

test('encodeWavPcm16Mono writes valid 44100Hz 16-bit mono RIFF WAVE header and payload', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1.0, -1.0]);
  const wav = encodeWavPcm16Mono(samples);

  assert.equal(wav.byteLength, 44 + samples.length * 2);

  const header = parseWavHeader(wav);
  assert.equal(header.riffTag, 'RIFF');
  assert.equal(header.waveTag, 'WAVE');
  assert.equal(header.audioFormat, 1); // PCM
  assert.equal(header.numChannels, TARGET_AUDIO_CHANNELS); // 1 (mono)
  assert.equal(header.sampleRate, TARGET_AUDIO_SAMPLE_RATE); // 44100
  assert.equal(header.bitsPerSample, TARGET_AUDIO_BIT_DEPTH); // 16
  assert.equal(header.byteRate, 88200);
  assert.equal(header.blockAlign, 2);
  assert.equal(header.dataChunkSize, 10);

  const view = new DataView(wav.buffer);
  assert.equal(view.getInt16(44, true), 0);
  assert.equal(view.getInt16(46, true), 16384);
  assert.equal(view.getInt16(48, true), -16384);
  assert.equal(view.getInt16(50, true), 32767);
  assert.equal(view.getInt16(52, true), -32768);
});

test('downmixAndResampleTo44100Mono downmixes stereo and resamples to 44100Hz', () => {
  const left = new Float32Array(48000).fill(0.8);
  const right = new Float32Array(48000).fill(0.2);

  const mono44100 = downmixAndResampleTo44100Mono([left, right], 48000);
  assert.equal(mono44100.length, 44100);
  assert.ok(Math.abs(mono44100[0] - 0.5) < 1e-5);
  assert.ok(Math.abs(mono44100[22050] - 0.5) < 1e-5);
});

test('encodeRgb565LittleEndian produces exact 153,600 bytes little-endian RGB565 for 320x240', () => {
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

  // Pixel 3: Pure White (255, 255, 255) -> RGB565 = 0xFFFF -> Little Endian [0xFF, 0xFF]
  rgba[12] = 255;
  rgba[13] = 255;
  rgba[14] = 255;
  rgba[15] = 255;

  const bin = encodeRgb565LittleEndian(rgba, TFT_WIDTH, TFT_HEIGHT, false);
  assert.equal(bin.byteLength, TFT_RGB565_BYTE_LENGTH);

  // Check little-endian byte ordering
  assert.equal(bin[0], 0x00);
  assert.equal(bin[1], 0xf8);

  assert.equal(bin[2], 0xe0);
  assert.equal(bin[3], 0x07);

  assert.equal(bin[4], 0x1f);
  assert.equal(bin[5], 0x00);

  assert.equal(bin[6], 0xff);
  assert.equal(bin[7], 0xff);

  // Round-trip decode to RGBA
  const decoded = decodeRgb565LittleEndianToRgba(bin);
  assert.equal(decoded[0], 255);
  assert.equal(decoded[1], 0);
  assert.equal(decoded[2], 0);
  assert.equal(decoded[4], 0);
  assert.equal(decoded[5], 255);
  assert.equal(decoded[6], 0);
  assert.equal(decoded[8], 0);
  assert.equal(decoded[9], 0);
  assert.equal(decoded[10], 255);
});

test('reorderItems moves playlist track indices cleanly', () => {
  const list = ['track-a', 'track-b', 'track-c', 'track-d'];
  assert.deepEqual(reorderItems(list, 0, 2), ['track-b', 'track-c', 'track-a', 'track-d']);
  assert.deepEqual(reorderItems(list, 3, 1), ['track-a', 'track-d', 'track-b', 'track-c']);
  assert.deepEqual(reorderItems(list, 1, 1), ['track-a', 'track-b', 'track-c', 'track-d']);
});

test('parseFilenameMetadata splits artist and title from filename', () => {
  const meta1 = parseFilenameMetadata('Tycho - Awake.flac');
  assert.equal(meta1.artist, 'Tycho');
  assert.equal(meta1.title, 'Awake');
  assert.equal(meta1.ext, 'FLAC');

  const meta2 = parseFilenameMetadata('synth_loop_01.mp3');
  assert.equal(meta2.artist, 'Unknown Artist');
  assert.equal(meta2.title, 'synth loop 01');
  assert.equal(meta2.ext, 'MP3');
});
