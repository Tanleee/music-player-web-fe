export type PlayerPlaybackState = 'playing' | 'paused' | 'stopped';
export type TransferType = 'audio' | 'wallpaper' | '';

export interface ApiPlayerStatus {
  state: PlayerPlaybackState;
  track: string;
  position_s: number;
  duration_s: number;
  volume: number; // 0-100
}

export interface ApiDisplayStatus {
  brightness: number; // 0-100
}

export interface ApiSdStatus {
  ok: boolean;
  free_mb: number;
  total_mb: number;
}

export interface ApiWifiStatus {
  rssi: number;
  ip: string;
}

export interface ApiBtStatus {
  connected: boolean;
  device: string;
}

export interface ApiTransferStatus {
  active: boolean;
  type: TransferType;
  name: string;
  percent: number; // 0-100
}

/**
 * Exact JSON shape returned by GET /api/status
 */
export interface ApiStatusResponse {
  player: ApiPlayerStatus;
  display: ApiDisplayStatus;
  sd: ApiSdStatus;
  wifi: ApiWifiStatus;
  bt: ApiBtStatus;
  transfer: ApiTransferStatus;
}

export interface DeviceTrackItem {
  name: string;
  size: number;
}

/**
 * Exact JSON shape returned by GET /api/tracks
 */
export interface ApiTracksResponse {
  tracks: DeviceTrackItem[];
}

export type DeviceCommandType =
  | 'play'
  | 'pause'
  | 'stop'
  | 'next'
  | 'prev'
  | 'volume'
  | 'brightness'
  | 'play_track'
  | 'delete_track';

/**
 * Exact JSON body sent to POST /api/cmd
 */
export interface ApiCmdRequest {
  cmd: DeviceCommandType;
  value?: number;
  name?: string;
}

/**
 * Exact JSON response from POST /api/cmd and POST /api/upload/*
 */
export interface ApiActionResponse {
  ok: boolean;
  error?: string;
}

/**
 * Client-side audio conversion queue item (before/after conversion & upload to ESP32 SD card)
 */
export type TrackConversionStatus = 'converting' | 'done' | 'error';

export interface StagedAudioTrack {
  id: string;
  originalFileName: string;
  sanitizedWavName: string;
  title: string;
  artist: string;
  originalFormat: string;
  originalSizeBytes: number;
  originalSampleRate: number;
  originalChannels: number;
  convertedSizeBytes: number;
  durationSec: number;
  status: TrackConversionStatus;
  progress: number;
  errorMessage?: string;
  originalAudioUrl: string;
  convertedWavUrl?: string;
  convertedWavBytes?: Uint8Array;
  uploadedToDevice?: boolean;
}

/**
 * Portrait 240x320 RGB565 little-endian wallpaper (153,600 bytes)
 */
export interface SavedWallpaper {
  id: string;
  name: string;
  sanitizedBinName: string;
  createdAt: string;
  width: 240;
  height: 320;
  byteLength: 153600;
  rgb565Bytes: Uint8Array;
  previewDataUrl: string;
  sourceDataUrl: string;
  dithered: boolean;
}
