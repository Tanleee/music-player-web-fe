import {
  AudioTrack,
  DeviceCommandLog,
  DeviceStatus,
  PlaybackState,
  Playlist,
  SavedWallpaper,
} from '../types/player';
import { formatBytes } from '../utils/encoders';

/**
 * Placeholder Device Communication Layer for ESP32-C3 + ST7789 Music Player.
 *
 * The hardware connection protocol (WebSerial UART, BLE GATT, or WiFi HTTP/WebSocket)
 * is not decided yet. All functions below act as clean, modular stubs that record
 * structured command payloads and return simulated responses so a real transport
 * can be wired in later without changing UI components.
 */

export const INITIAL_DEVICE_STATUS: DeviceStatus = {
  connected: false,
  transportType: 'placeholder-stub',
  batteryPercent: 86,
  batteryVoltageMv: 4080,
  isCharging: false,
  wifiSsid: 'MakerBench_2.4GHz',
  wifiRssiDbm: -56,
  ipAddress: '192.168.1.142',
  firmwareVersion: 'v0.9.4-esp32c3 (LovyanGFX 1.1.16)',
  mcuModel: 'ESP32-C3FH4 (RISC-V 160MHz)',
  displayDriver: 'ST7789 320x240 SPI (RGB565 LE)',
  sdTotalBytes: 16 * 1024 * 1024 * 1024, // 16 GB SDHC
  sdUsedBytes: 4.58 * 1024 * 1024 * 1024, // 4.58 GB used
  sdFreeBytes: 11.42 * 1024 * 1024 * 1024, // 11.42 GB free
  lastSyncAt: '2026-10-25 08:15',
};

function makeLogEntry(action: string, payloadSummary: string): DeviceCommandLog {
  const now = new Date();
  const timeStr = now.toTimeString().slice(0, 8);
  return {
    id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: timeStr,
    action,
    payloadSummary,
    status: 'queued-placeholder',
  };
}

/**
 * Placeholder: Send playback transport control command to the ESP32-C3.
 */
export async function sendPlaybackCommandToDevice(
  command: 'play' | 'pause' | 'next' | 'prev' | 'seek' | 'volume' | 'shuffle' | 'repeat' | 'select_track',
  statePatch: Partial<PlaybackState>
): Promise<DeviceCommandLog> {
  // TODO: Wire in WebSerial / WebSocket / HTTP transport once ESP32-C3 protocol is finalized
  return makeLogEntry(
    `PLAYBACK_${command.toUpperCase()}`,
    JSON.stringify(statePatch)
  );
}

/**
 * Placeholder: Sync converted 44.1kHz 16-bit Mono WAV tracks & playlists to the ESP32-C3 SD card.
 */
export async function syncLibraryToDevicePlaceholder(
  tracks: AudioTrack[],
  playlists: Playlist[]
): Promise<{ log: DeviceCommandLog; syncedCount: number; totalBytes: number }> {
  const readyTracks = tracks.filter((t) => t.status === 'done');
  const totalBytes = readyTracks.reduce((acc, t) => acc + t.convertedSizeBytes, 0);
  // TODO: Stream WAV files (44100Hz, 16-bit PCM, mono) to /sd/music/ and write /sd/playlists.json
  const log = makeLogEntry(
    'SYNC_LIBRARY_TO_SD',
    `tracks=${readyTracks.length} (${formatBytes(totalBytes)}), playlists=${playlists.length} -> /sd/music/`
  );
  return {
    log,
    syncedCount: readyTracks.length,
    totalBytes,
  };
}

/**
 * Placeholder: Push a 320x240 RGB565 little-endian .bin wallpaper to the ESP32-C3 ST7789 display.
 */
export async function sendWallpaperToDevicePlaceholder(
  wallpaper: SavedWallpaper
): Promise<DeviceCommandLog> {
  // TODO: Send 153,600 bytes raw RGB565 little-endian frame buffer to ESP32-C3 /sd/wallpapers/
  return makeLogEntry(
    'PUSH_WALLPAPER_RGB565',
    `name="${wallpaper.name}", resolution=320x240, format=RGB565_LE, bytes=${wallpaper.byteLength}`
  );
}

/**
 * Placeholder: Poll device telemetry (battery, WiFi RSSI, SD card free space).
 */
export async function pollDeviceTelemetryPlaceholder(
  current: DeviceStatus
): Promise<{ status: DeviceStatus; log: DeviceCommandLog }> {
  // Slight realistic jitter on RSSI and voltage for UI testing
  const rssiDelta = Math.floor(Math.random() * 5) - 2;
  const nextRssi = Math.max(-82, Math.min(-42, current.wifiRssiDbm + rssiDelta));
  const nowStr = new Date().toTimeString().slice(0, 5);

  const nextStatus: DeviceStatus = {
    ...current,
    wifiRssiDbm: nextRssi,
    lastSyncAt: `Today ${nowStr}`,
  };

  const log = makeLogEntry(
    'POLL_TELEMETRY',
    `batt=${nextStatus.batteryPercent}% (${nextStatus.batteryVoltageMv}mV), rssi=${nextStatus.wifiRssiDbm}dBm`
  );

  return { status: nextStatus, log };
}
