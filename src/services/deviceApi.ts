import {
  ApiActionResponse,
  ApiCmdRequest,
  ApiStatusResponse,
  ApiTracksResponse,
  DeviceTrackItem,
} from '../types/player';
import { TFT_RGB565_BYTE_LENGTH, sanitizeFatFilename } from '../utils/encoders';

const STATUS_TRACKS_TIMEOUT_MS = 3000;
const CMD_TIMEOUT_MS = 3000;

/**
 * Mock mode is active ONLY in development when VITE_MOCK !== 'false'.
 * A production build (npm run build) ALWAYS uses real /api/* calls.
 */
export const IS_MOCK_MODE: boolean =
  import.meta.env.DEV && import.meta.env.VITE_MOCK !== 'false';

export const INITIAL_STATUS_FALLBACK: ApiStatusResponse = {
  player: {
    state: 'stopped',
    track: '',
    position_s: 0,
    duration_s: 0,
    volume: 75,
  },
  display: {
    brightness: 80,
  },
  sd: {
    ok: true,
    free_mb: 11694,
    total_mb: 15872,
  },
  wifi: {
    rssi: -58,
    ip: '192.168.1.142',
  },
  bt: {
    connected: true,
    device: 'JBL GO 3',
  },
  transfer: {
    active: false,
    type: '',
    name: '',
    percent: 0,
  },
};

// In-memory state used only when IS_MOCK_MODE is active
let mockTracks: DeviceTrackItem[] = [
  { name: 'Solar_Wind_Drift.wav', size: 15876044 },
  { name: 'Subroutine_09.wav', size: 12524444 },
  { name: 'Night_Train_C3.wav', size: 18698444 },
];

let mockStatus: ApiStatusResponse = {
  player: {
    state: 'paused',
    track: 'Solar_Wind_Drift.wav',
    position_s: 42,
    duration_s: 180,
    volume: 75,
  },
  display: {
    brightness: 85,
  },
  sd: {
    ok: true,
    free_mb: 11694,
    total_mb: 15872,
  },
  wifi: {
    rssi: -56,
    ip: '192.168.1.142',
  },
  bt: {
    connected: true,
    device: 'JBL GO 3',
  },
  transfer: {
    active: false,
    type: '',
    name: '',
    percent: 0,
  },
};

let lastMockTick = Date.now();

function advanceMockPlayerClock(): void {
  const now = Date.now();
  const elapsedSec = Math.floor((now - lastMockTick) / 1000);
  if (elapsedSec >= 1) {
    lastMockTick = now;
    if (mockStatus.player.state === 'playing' && mockStatus.player.duration_s > 0) {
      const nextPos = mockStatus.player.position_s + elapsedSec;
      mockStatus.player.position_s =
        nextPos >= mockStatus.player.duration_s ? 0 : nextPos;
    }
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = STATUS_TRACKS_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err instanceof Error ? err : new Error(`Network request failed: ${url}`);
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * GET /api/status
 */
export async function fetchDeviceStatus(): Promise<ApiStatusResponse> {
  if (IS_MOCK_MODE) {
    advanceMockPlayerClock();
    return structuredClone(mockStatus);
  }

  const res = await fetchWithTimeout(
    '/api/status',
    {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    },
    STATUS_TRACKS_TIMEOUT_MS
  );

  if (!res.ok) {
    throw new Error(`GET /api/status failed with HTTP ${res.status}`);
  }

  return (await res.json()) as ApiStatusResponse;
}

/**
 * GET /api/tracks
 */
export async function fetchDeviceTracks(): Promise<ApiTracksResponse> {
  if (IS_MOCK_MODE) {
    return { tracks: structuredClone(mockTracks) };
  }

  const res = await fetchWithTimeout(
    '/api/tracks',
    {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    },
    STATUS_TRACKS_TIMEOUT_MS
  );

  if (!res.ok) {
    throw new Error(`GET /api/tracks failed with HTTP ${res.status}`);
  }

  return (await res.json()) as ApiTracksResponse;
}

/**
 * POST /api/cmd
 */
export async function sendDeviceCommand(
  payload: ApiCmdRequest
): Promise<ApiActionResponse> {
  if (IS_MOCK_MODE) {
    switch (payload.cmd) {
      case 'play':
        if (!mockStatus.player.track && mockTracks.length > 0) {
          mockStatus.player.track = mockTracks[0].name;
          mockStatus.player.duration_s = Math.max(
            1,
            Math.round(mockTracks[0].size / 88200)
          );
        }
        mockStatus.player.state = 'playing';
        lastMockTick = Date.now();
        break;
      case 'pause':
        mockStatus.player.state = 'paused';
        break;
      case 'stop':
        mockStatus.player.state = 'stopped';
        mockStatus.player.position_s = 0;
        break;
      case 'next': {
        if (mockTracks.length > 0) {
          const idx = mockTracks.findIndex((t) => t.name === mockStatus.player.track);
          const next = mockTracks[(idx + 1) % mockTracks.length];
          mockStatus.player.track = next.name;
          mockStatus.player.position_s = 0;
          mockStatus.player.duration_s = Math.max(1, Math.round(next.size / 88200));
        }
        break;
      }
      case 'prev': {
        if (mockTracks.length > 0) {
          const idx = mockTracks.findIndex((t) => t.name === mockStatus.player.track);
          const prev =
            mockTracks[(idx - 1 + mockTracks.length) % mockTracks.length];
          mockStatus.player.track = prev.name;
          mockStatus.player.position_s = 0;
          mockStatus.player.duration_s = Math.max(1, Math.round(prev.size / 88200));
        }
        break;
      }
      case 'volume':
        if (typeof payload.value === 'number') {
          mockStatus.player.volume = Math.max(0, Math.min(100, Math.round(payload.value)));
        }
        break;
      case 'brightness':
        if (typeof payload.value === 'number') {
          mockStatus.display.brightness = Math.max(
            0,
            Math.min(100, Math.round(payload.value))
          );
        }
        break;
      case 'play_track': {
        if (!payload.name) {
          return { ok: false, error: 'Missing track name' };
        }
        const found = mockTracks.find((t) => t.name === payload.name);
        if (!found) {
          return { ok: false, error: `Track "${payload.name}" not found on SD card` };
        }
        mockStatus.player.track = found.name;
        mockStatus.player.state = 'playing';
        mockStatus.player.position_s = 0;
        mockStatus.player.duration_s = Math.max(1, Math.round(found.size / 88200));
        lastMockTick = Date.now();
        break;
      }
      case 'delete_track': {
        if (!payload.name) {
          return { ok: false, error: 'Missing track name' };
        }
        const target = mockTracks.find((t) => t.name === payload.name);
        mockTracks = mockTracks.filter((t) => t.name !== payload.name);
        if (target) {
          mockStatus.sd.free_mb = Math.min(
            mockStatus.sd.total_mb,
             +(mockStatus.sd.free_mb + target.size / (1024 * 1024)).toFixed(1)
          );
        }
        if (mockStatus.player.track === payload.name) {
          mockStatus.player.state = 'stopped';
          mockStatus.player.track = mockTracks[0]?.name ?? '';
          mockStatus.player.position_s = 0;
        }
        break;
      }
    }
    return { ok: true };
  }

  const res = await fetchWithTimeout(
    '/api/cmd',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    },
    CMD_TIMEOUT_MS
  );

  let data: ApiActionResponse;
  try {
    data = (await res.json()) as ApiActionResponse;
  } catch {
    throw new Error(`Invalid JSON response from POST /api/cmd (HTTP ${res.status})`);
  }

  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Command "${payload.cmd}" failed (HTTP ${res.status})`);
  }

  return data;
}

export const UPLOAD_NETWORK_ERROR_MESSAGE =
  'Upload interrupted. Check that the ESP32 is on the same WiFi, then retry.';

/**
 * Helper to upload binary buffer via XMLHttpRequest with live progress reporting
 * and no request timeout.
 */
function uploadBinaryViaXhr(
  url: string,
  bytes: Uint8Array,
  onProgress?: (percent: number) => void
): Promise<ApiActionResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.timeout = 0; // No timeout for large SD card transfers
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('Accept', 'application/json');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const pct = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onProgress?.(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status === 0) {
        reject(new Error(UPLOAD_NETWORK_ERROR_MESSAGE));
        return;
      }

      let parsed: ApiActionResponse | null = null;
      try {
        parsed = JSON.parse(xhr.responseText) as ApiActionResponse;
      } catch {
        // Fallback if server returns plain text on error
      }

      if (xhr.status >= 200 && xhr.status < 300 && parsed?.ok !== false) {
        onProgress?.(100);
        resolve(parsed ?? { ok: true });
      } else {
        reject(
          new Error(
            parsed?.error || `Upload failed with HTTP ${xhr.status} (${xhr.statusText || 'Error'})`
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(new Error(UPLOAD_NETWORK_ERROR_MESSAGE));
    };

    xhr.onabort = () => {
      reject(new Error(UPLOAD_NETWORK_ERROR_MESSAGE));
    };

    const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' });
    xhr.send(blob);
  });
}

/**
 * POST /api/upload/audio?name=<ascii_filename>.wav
 * Body: raw WAV bytes (44.1 kHz, 16-bit, mono).
 */
export async function uploadAudioToDevice(
  rawFileName: string,
  wavBytes: Uint8Array,
  onProgress?: (percent: number) => void
): Promise<{ sanitizedName: string; response: ApiActionResponse }> {
  const sanitizedName = sanitizeFatFilename(rawFileName, 'wav');

  if (IS_MOCK_MODE) {
    if (mockStatus.transfer.active) {
      throw new Error('Another file transfer is already active on the device.');
    }
    mockStatus.transfer = {
      active: true,
      type: 'audio',
      name: sanitizedName,
      percent: 0,
    };

    const steps = [15, 35, 60, 85, 100];
    for (const pct of steps) {
      await new Promise((r) => setTimeout(r, 120));
      mockStatus.transfer.percent = pct;
      onProgress?.(pct);
    }

    const existingIdx = mockTracks.findIndex((t) => t.name === sanitizedName);
    if (existingIdx >= 0) {
      mockTracks[existingIdx] = { name: sanitizedName, size: wavBytes.byteLength };
    } else {
      mockTracks = [{ name: sanitizedName, size: wavBytes.byteLength }, ...mockTracks];
      mockStatus.sd.free_mb = Math.max(
        0,
        +(mockStatus.sd.free_mb - wavBytes.byteLength / (1024 * 1024)).toFixed(1)
      );
    }

    mockStatus.transfer = {
      active: false,
      type: '',
      name: '',
      percent: 0,
    };

    return { sanitizedName, response: { ok: true } };
  }

  const url = `/api/upload/audio?name=${encodeURIComponent(sanitizedName)}`;
  const response = await uploadBinaryViaXhr(url, wavBytes, onProgress);
  return { sanitizedName, response };
}

/**
 * POST /api/upload/wallpaper?name=<ascii_filename>
 * Body: raw 153600 bytes RGB565 little-endian, 240x320.
 */
export async function uploadWallpaperToDevice(
  rawName: string,
  rgb565Bytes: Uint8Array,
  onProgress?: (percent: number) => void
): Promise<{ sanitizedName: string; response: ApiActionResponse }> {
  if (rgb565Bytes.byteLength !== TFT_RGB565_BYTE_LENGTH) {
    throw new Error(
      `Invalid RGB565 buffer length: expected ${TFT_RGB565_BYTE_LENGTH} bytes, got ${rgb565Bytes.byteLength}`
    );
  }

  const sanitizedName = sanitizeFatFilename(rawName, '');

  if (IS_MOCK_MODE) {
    if (mockStatus.transfer.active) {
      throw new Error('Another file transfer is already active on the device.');
    }
    mockStatus.transfer = {
      active: true,
      type: 'wallpaper',
      name: sanitizedName,
      percent: 0,
    };

    const steps = [20, 50, 80, 100];
    for (const pct of steps) {
      await new Promise((r) => setTimeout(r, 110));
      mockStatus.transfer.percent = pct;
      onProgress?.(pct);
    }

    mockStatus.transfer = {
      active: false,
      type: '',
      name: '',
      percent: 0,
    };

    return { sanitizedName, response: { ok: true } };
  }

  const url = `/api/upload/wallpaper?name=${encodeURIComponent(sanitizedName)}`;
  const response = await uploadBinaryViaXhr(url, rgb565Bytes, onProgress);
  return { sanitizedName, response };
}
