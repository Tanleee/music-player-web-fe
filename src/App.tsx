/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navbar, ActivePage } from './components/Navbar';
import { MusicLibraryPage } from './components/MusicLibraryPage';
import { WallpaperPage } from './components/WallpaperPage';
import { DeviceControlPage } from './components/DeviceControlPage';
import {
  ApiCmdRequest,
  ApiStatusResponse,
  DeviceTrackItem,
  SavedWallpaper,
  StagedAudioTrack,
} from './types/player';
import { parseFilenameMetadata, sanitizeFatFilename } from './utils/encoders';
import { convertAudioFileToFixedWav } from './services/audioConverter';
import {
  INITIAL_STATUS_FALLBACK,
  IS_MOCK_MODE,
  UPLOAD_NETWORK_ERROR_MESSAGE,
  fetchDeviceStatus,
  fetchDeviceTracks,
  sendDeviceCommand,
  uploadAudioToDevice,
  uploadWallpaperToDevice,
} from './services/deviceApi';

export default function App() {
  const [activePage, setActivePage] = useState<ActivePage>('library');

  // Real device status polled sequentially via recursive setTimeout
  const [status, setStatus] = useState<ApiStatusResponse>(INITIAL_STATUS_FALLBACK);
  const [isConnected, setIsConnected] = useState<boolean>(IS_MOCK_MODE);
  const consecutiveFailuresRef = useRef<number>(0);

  // Device SD card tracks from GET /api/tracks
  const [deviceTracks, setDeviceTracks] = useState<DeviceTrackItem[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState<boolean>(false);
  const [tracksError, setTracksError] = useState<string | null>(null);

  // Client-side staged audio conversions
  const [stagedTracks, setStagedTracks] = useState<StagedAudioTrack[]>([]);
  const [uploadingTrackId, setUploadingTrackId] = useState<string | null>(null);

  // Portrait 240x320 saved wallpapers in current session
  const [savedWallpapers, setSavedWallpapers] = useState<SavedWallpaper[]>([]);
  const [activeWallpaperId, setActiveWallpaperId] = useState<string>('');
  const [isUploadingWallpaper, setIsUploadingWallpaper] = useState<boolean>(false);

  // Shared XHR upload progress & error state
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadingLabel, setUploadingLabel] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);

  const isUploading = uploadingTrackId !== null || isUploadingWallpaper;

  const loadTracks = useCallback(async () => {
    setIsLoadingTracks(true);
    try {
      const res = await fetchDeviceTracks();
      setDeviceTracks(res.tracks || []);
      setTracksError(null);
    } catch (err) {
      setTracksError(
        err instanceof Error ? err.message : 'Failed to load tracks from /api/tracks'
      );
    } finally {
      setIsLoadingTracks(false);
    }
  }, []);

  // Sequential recursive setTimeout status polling loop:
  // - Pauses completely while any audio or wallpaper upload is running.
  // - Waits 1000 ms after success, or 2000 ms after failure.
  // - Only sets isConnected=false after 3 consecutive failures.
  // - Resumes immediately when an upload finishes.
  useEffect(() => {
    if (isUploading) {
      return;
    }

    let cancelled = false;
    let timerId: number | undefined;

    const pollOnce = async () => {
      if (cancelled) return;
      try {
        const nextStatus = await fetchDeviceStatus();
        if (cancelled) return;
        consecutiveFailuresRef.current = 0;
        setStatus(nextStatus);
        setIsConnected(true);
        timerId = window.setTimeout(() => {
          void pollOnce();
        }, 1000);
      } catch {
        if (cancelled) return;
        consecutiveFailuresRef.current += 1;
        if (consecutiveFailuresRef.current >= 3) {
          setIsConnected(false);
        }
        timerId = window.setTimeout(() => {
          void pollOnce();
        }, 2000);
      }
    };

    void pollOnce();

    return () => {
      cancelled = true;
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
    };
  }, [isUploading]);

  // Initial load of GET /api/tracks
  useEffect(() => {
    void loadTracks();
  }, [loadTracks]);

  const handleSendCommand = async (payload: ApiCmdRequest) => {
    if (isUploading) return;
    setActionError(null);
    try {
      await sendDeviceCommand(payload);
      // Apply immediate local feedback while the single sequential poll loop fetches /api/status
      setStatus((prev) => {
        const next = structuredClone(prev);
        if (payload.cmd === 'play') next.player.state = 'playing';
        else if (payload.cmd === 'pause') next.player.state = 'paused';
        else if (payload.cmd === 'stop') {
          next.player.state = 'stopped';
          next.player.position_s = 0;
        } else if (payload.cmd === 'volume' && typeof payload.value === 'number') {
          next.player.volume = payload.value;
        } else if (payload.cmd === 'brightness' && typeof payload.value === 'number') {
          next.display.brightness = payload.value;
        } else if (payload.cmd === 'play_track' && payload.name) {
          next.player.track = payload.name;
          next.player.state = 'playing';
          next.player.position_s = 0;
        }
        return next;
      });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : `Command "${payload.cmd}" failed`
      );
    }
  };

  const handlePlayDeviceTrack = async (trackName: string) => {
    await handleSendCommand({ cmd: 'play_track', name: trackName });
  };

  const handleDeleteDeviceTrack = async (trackName: string) => {
    if (isUploading) return;
    setActionError(null);
    try {
      await sendDeviceCommand({ cmd: 'delete_track', name: trackName });
      await loadTracks();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : `Failed to delete "${trackName}"`
      );
    }
  };

  // Convert local audio files client-side to 44.1 kHz, 16-bit PCM, Mono WAV
  const handleSelectLocalFiles = async (files: File[]) => {
    const newItems: { item: StagedAudioTrack; file: File }[] = files.map((file) => {
      const meta = parseFilenameMetadata(file.name);
      const id = `stg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const originalAudioUrl = URL.createObjectURL(file);
      return {
        file,
        item: {
          id,
          originalFileName: file.name,
          sanitizedWavName: sanitizeFatFilename(file.name, 'wav'),
          title: meta.title,
          artist: meta.artist,
          originalFormat: meta.ext,
          originalSizeBytes: file.size,
          originalSampleRate: 44100,
          originalChannels: 2,
          convertedSizeBytes: 0,
          durationSec: 0,
          status: 'converting',
          progress: 5,
          originalAudioUrl,
        },
      };
    });

    setStagedTracks((prev) => [...newItems.map((n) => n.item), ...prev]);

    for (const entry of newItems) {
      try {
        const result = await convertAudioFileToFixedWav(entry.file, (progress) => {
          setStagedTracks((prev) =>
            prev.map((t) => (t.id === entry.item.id ? { ...t, progress } : t))
          );
        });

        setStagedTracks((prev) =>
          prev.map((t) =>
            t.id === entry.item.id
              ? {
                  ...t,
                  status: 'done',
                  progress: 100,
                  durationSec: result.durationSec,
                  originalSampleRate: result.originalSampleRate,
                  originalChannels: result.originalChannels,
                  convertedSizeBytes: result.wavBytes.byteLength,
                  convertedWavUrl: result.wavBlobUrl,
                  convertedWavBytes: result.wavBytes,
                }
              : t
          )
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to decode audio file';
        setStagedTracks((prev) =>
          prev.map((t) =>
            t.id === entry.item.id
              ? {
                  ...t,
                  status: 'error',
                  progress: 0,
                  errorMessage: message,
                }
              : t
          )
        );
      }
    }
  };

  const handleUpdateStagedTitle = (
    id: string,
    newTitle: string,
    newArtist: string
  ) => {
    setStagedTracks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              title: newTitle,
              artist: newArtist,
              sanitizedWavName: sanitizeFatFilename(newTitle, 'wav'),
            }
          : t
      )
    );
  };

  const handleRemoveStagedTrack = (id: string) => {
    setStagedTracks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleUploadStagedTrack = async (track: StagedAudioTrack) => {
    if (!track.convertedWavBytes || isUploading) return;
    setActionError(null);
    setUploadingTrackId(track.id);
    setUploadingLabel(`AUDIO: ${track.sanitizedWavName}`);
    setUploadProgress(0);
    try {
      await uploadAudioToDevice(
        track.sanitizedWavName,
        track.convertedWavBytes,
        (pct) => setUploadProgress(pct)
      );
      setStagedTracks((prev) =>
        prev.map((t) =>
          t.id === track.id ? { ...t, uploadedToDevice: true } : t
        )
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : UPLOAD_NETWORK_ERROR_MESSAGE
      );
    } finally {
      setUploadingTrackId(null);
      setUploadingLabel('');
      setUploadProgress(0);
      await loadTracks();
    }
  };

  // Wallpaper handlers
  const handleSaveWallpaper = (wp: SavedWallpaper) => {
    setSavedWallpapers((prev) => [wp, ...prev]);
    setActiveWallpaperId(wp.id);
  };

  const handleSelectSavedWallpaper = (wp: SavedWallpaper) => {
    setActiveWallpaperId(wp.id);
  };

  const handleDeleteSavedWallpaper = (wallpaperId: string) => {
    setSavedWallpapers((prev) => prev.filter((w) => w.id !== wallpaperId));
  };

  const handleSendWallpaperToDevice = async (
    name: string,
    rgb565Bytes: Uint8Array
  ): Promise<string | null> => {
    if (isUploading) return null;
    setActionError(null);
    setIsUploadingWallpaper(true);
    const sanitized = sanitizeFatFilename(name, '');
    setUploadingLabel(`WALLPAPER: ${sanitized}`);
    setUploadProgress(0);
    try {
      const res = await uploadWallpaperToDevice(name, rgb565Bytes, (pct) =>
        setUploadProgress(pct)
      );
      return res.sanitizedName;
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : UPLOAD_NETWORK_ERROR_MESSAGE
      );
      return null;
    } finally {
      setIsUploadingWallpaper(false);
      setUploadingLabel('');
      setUploadProgress(0);
      await loadTracks();
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#0b0f17] text-slate-100">
      <Navbar
        activePage={activePage}
        onNavigate={setActivePage}
        isConnected={isConnected}
        wifiIp={status.wifi.ip}
        wifiRssi={status.wifi.rssi}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 sm:px-6 py-5 sm:py-8 min-w-0">
        {activePage === 'library' && (
          <MusicLibraryPage
            deviceTracks={deviceTracks}
            stagedTracks={stagedTracks}
            status={status}
            isConnected={isConnected}
            isLoadingTracks={isLoadingTracks}
            tracksError={tracksError}
            uploadingTrackId={uploadingTrackId}
            isUploadingAny={isUploading}
            uploadProgress={uploadProgress}
            actionError={actionError}
            onClearError={() => {
              setActionError(null);
              setTracksError(null);
            }}
            onRefreshTracks={() => void loadTracks()}
            onPlayDeviceTrack={handlePlayDeviceTrack}
            onDeleteDeviceTrack={handleDeleteDeviceTrack}
            onSelectLocalFiles={(files) => void handleSelectLocalFiles(files)}
            onUpdateStagedTitle={handleUpdateStagedTitle}
            onRemoveStagedTrack={handleRemoveStagedTrack}
            onUploadStagedTrack={handleUploadStagedTrack}
          />
        )}

        {activePage === 'wallpaper' && (
          <WallpaperPage
            savedWallpapers={savedWallpapers}
            activeWallpaperId={activeWallpaperId}
            status={status}
            isConnected={isConnected}
            isUploadingWallpaper={isUploadingWallpaper}
            isUploadingAny={isUploading}
            uploadProgress={uploadProgress}
            actionError={actionError}
            onClearError={() => setActionError(null)}
            onSaveWallpaper={handleSaveWallpaper}
            onSelectSavedWallpaper={handleSelectSavedWallpaper}
            onDeleteSavedWallpaper={handleDeleteSavedWallpaper}
            onSendWallpaperToDevice={handleSendWallpaperToDevice}
          />
        )}

        {activePage === 'control' && (
          <DeviceControlPage
            status={status}
            isConnected={isConnected}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            uploadingLabel={uploadingLabel}
            actionError={actionError}
            onClearError={() => setActionError(null)}
            onSendCommand={handleSendCommand}
          />
        )}
      </main>

      <footer className="border-t border-slate-800/80 py-5 px-3 sm:px-6 text-xs text-slate-500">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-2 sm:gap-4 min-w-0">
          <span className="min-w-0">
            PocketAudio ESP32 · Local LAN Web Interface {IS_MOCK_MODE ? '(Mock Mode Active)' : ''}
          </span>
          <span className="min-w-0">
            Audio Target: WAV 44,100 Hz 16-bit PCM Mono · Display Target: 240×320 RGB565 Little-Endian
          </span>
        </div>
      </footer>
    </div>
  );
}
