export type TrackConversionStatus = 'converting' | 'done' | 'error';

export interface AudioTrack {
  id: string;
  fileName: string;
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
  conversionEngine?: 'ffmpeg.wasm' | 'web-audio-pcm16';
  addedAt: string;
  syncedToDevice?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
  updatedAt: string;
}

export interface SavedWallpaper {
  id: string;
  name: string;
  createdAt: string;
  width: 320;
  height: 240;
  byteLength: 153600;
  rgb565Bytes: Uint8Array;
  previewDataUrl: string;
  sourceDataUrl: string;
  dithered: boolean;
  isActiveOnDevice: boolean;
}

export interface DeviceStatus {
  connected: boolean;
  transportType: 'placeholder-stub';
  batteryPercent: number;
  batteryVoltageMv: number;
  isCharging: boolean;
  wifiSsid: string;
  wifiRssiDbm: number;
  ipAddress: string;
  firmwareVersion: string;
  mcuModel: string;
  displayDriver: string;
  sdTotalBytes: number;
  sdUsedBytes: number;
  sdFreeBytes: number;
  lastSyncAt: string;
}

export interface PlaybackState {
  currentTrackId: string | null;
  activePlaylistId: string;
  isPlaying: boolean;
  currentTimeSec: number;
  durationSec: number;
  volume: number;
  isMuted: boolean;
  isShuffle: boolean;
  repeatMode: 'off' | 'all' | 'one';
}

export interface DeviceCommandLog {
  id: string;
  timestamp: string;
  action: string;
  payloadSummary: string;
  status: 'queued-placeholder';
}
